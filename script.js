// ==================== KONFIGURASI GOOGLE SHEETS ====================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxKEcsNf4L_SD6KA1sv6QiPMJcdvOd5MwoZEo2MK-bFTysTUlMeATHuMUCc8amkwGgusw/exec';
const ADMIN_PIN = 'AyahNaufalFF';

let AFFILIATOR_DB = [];
let optionalSyncEndpoint = '';

const REGISTERED_STORAGE_KEY = 'ffp_affiliator_registered';
const REGISTERED_ID_KEY = 'ffp_affiliator_id';
const REGISTERED_NAME_KEY = 'ffp_affiliator_name';
let lockToastTimeout = null;
let isCheckingAccess = false;

function getSavedRegistrationId() {
  try {
    return localStorage.getItem(REGISTERED_ID_KEY) || '';
  } catch (e) {
    return '';
  }
}

function getSavedRegistrationName() {
  try {
    return localStorage.getItem(REGISTERED_NAME_KEY) || '';
  } catch (e) {
    return '';
  }
}

function clearSavedRegistration() {
  try {
    localStorage.removeItem(REGISTERED_STORAGE_KEY);
    localStorage.removeItem(REGISTERED_ID_KEY);
    localStorage.removeItem(REGISTERED_NAME_KEY);
  } catch (e) {}
  updateUserHeaderUI();
}

// Tampilkan nama user di header jika sudah terdaftar, atau kembalikan tombol Daftar
function updateUserHeaderUI() {
  const btnDaftar = document.getElementById('btnDaftarHeader');
  const userBadge = document.getElementById('userBadgeHeader');
  const userNameEl = document.getElementById('userBadgeName');
  if (!btnDaftar || !userBadge || !userNameEl) return;

  const savedId = getSavedRegistrationId();
  const savedName = getSavedRegistrationName();

  if (savedId && savedName) {
    userNameEl.textContent = savedName;
    userBadge.title = `Affiliator Terdaftar: ${savedName} (${savedId})`;
    btnDaftar.classList.add('hidden');
    userBadge.classList.remove('hidden');
    userBadge.classList.add('inline-flex');
  } else {
    btnDaftar.classList.remove('hidden');
    userBadge.classList.add('hidden');
    userBadge.classList.remove('inline-flex');
  }
}

// Cek otomatis ke Google Sheets saat halaman dibuka agar nama ikut hilang jika dihapus admin
async function verifySavedRegistrationOnLoad() {
  const savedId = getSavedRegistrationId();
  if (!savedId || !isGoogleScriptConfigured()) return;

  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=check&id=${encodeURIComponent(savedId)}`);
    const result = await response.json();
    if (result.status === 'success' && !result.exists) {
      clearSavedRegistration();
    }
  } catch (e) {
    // Biarkan tampilan tetap stabil jika koneksi sedang lambat
  }
}

// Format Angka ke Rupiah
function formatRupiah(angka) {
  const numberVal = Math.floor(Number(angka) || 0);
  return 'Rp ' + numberVal.toLocaleString('id-ID');
}

// Format Ribuan untuk Input Manual
function formatRibuan(angka) {
  const numberVal = Math.floor(Number(angka) || 0);
  return numberVal.toLocaleString('id-ID');
}

// Hitung Ulang Simulasi Komisi (2% Pengelola -> 10% Affiliator)
function hitungSimulasi(nilaiRumah) {
  const harga = Math.max(0, Number(nilaiRumah) || 0);
  const komisiPengelola = harga * 0.02;
  const komisiAffiliator = komisiPengelola * 0.10;
  const komisiDariAkadTidakBerlaku = harga * 0.10;

  document.getElementById('nominalKomisiPengelola').value = formatRupiah(komisiPengelola);
  document.getElementById('nominalKomisiAffiliator').value = formatRupiah(komisiAffiliator);
  document.getElementById('perbandinganResmi').textContent = formatRupiah(komisiAffiliator);
  document.getElementById('perbandinganTidakBerlaku').textContent = formatRupiah(komisiDariAkadTidakBerlaku);
}

// Handler saat user mengetik manual di kolom Nilai Rumah Terjual
function handleHargaInput(inputEl) {
  const rawDigits = inputEl.value.replace(/\D/g, '');
  const numericValue = parseInt(rawDigits, 10) || 0;
  inputEl.value = rawDigits ? formatRibuan(numericValue) : '';
  hitungSimulasi(numericValue);

  const selectEl = document.getElementById('selectHargaSimulasi');
  if (selectEl) {
    const matchOption = Array.from(selectEl.options).some(opt => opt.value === String(numericValue));
    selectEl.value = matchOption ? String(numericValue) : '';
  }
}

// Handler pilihan Dropdown cepat harga properti
function setHargaSimulasi(nominal) {
  const inputEl = document.getElementById('inputNilaiRumah');
  inputEl.value = formatRibuan(nominal);
  hitungSimulasi(nominal);

  const selectEl = document.getElementById('selectHargaSimulasi');
  if (selectEl) {
    const matchOption = Array.from(selectEl.options).some(opt => opt.value === String(nominal));
    selectEl.value = matchOption ? String(nominal) : '';
  }
}

// Scroll halus ke section tertentu
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Cek apakah URL Google Apps Script sudah diisi
function isGoogleScriptConfigured() {
  return GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.startsWith('https://script.google.com/');
}

// Submit Form Pendaftaran Affiliator ke Google Sheets
async function handleFormSubmit(event) {
  event.preventDefault();

  const checkedSosmed = Array.from(document.querySelectorAll('input[name="sosmed"]:checked')).map(cb => cb.value);
  const sosmedError = document.getElementById('sosmedError');
  if (checkedSosmed.length === 0) {
    sosmedError.classList.remove('hidden');
    document.getElementById('sosmedCheckboxes').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  } else {
    sosmedError.classList.add('hidden');
  }

  const formEl = document.getElementById('affiliatorForm');
  const submitBtn = formEl.querySelector('button[type="submit"]');
  const originalBtnHtml = submitBtn.innerHTML;

  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-70', 'cursor-wait');
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-lg"></i> <span>Menyimpan ke Database...</span>';

  const now = new Date();
  const fallbackTimestamp = now.toLocaleString('id-ID', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const payload = {
    namaLengkap: document.getElementById('namaLengkap').value.trim(),
    nomorWa: document.getElementById('nomorWa').value.trim(),
    emailAktif: document.getElementById('emailAktif').value.trim(),
    domisili: document.getElementById('domisili').value.trim(),
    mediaSosial: checkedSosmed.join(', '),
    akunSosmed: document.getElementById('akunSosmed').value.trim(),
    rekeningBank: document.getElementById('rekeningBank').value.trim()
  };

  let finalRegId = 'FFP-' + now.getFullYear() + '-' + String(AFFILIATOR_DB.length + 1).padStart(4, '0');
  let finalTimestamp = fallbackTimestamp;

  try {
    if (isGoogleScriptConfigured()) {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal menyimpan ke Google Sheets');
      }
      finalRegId = result.id || finalRegId;
      finalTimestamp = result.waktuDaftar || finalTimestamp;
    }

    const savedRecord = {
      id: finalRegId,
      waktuDaftar: finalTimestamp,
      ...payload,
      persenPengelola: '2%',
      persenAffiliator: '10% dari Komisi Pengelola',
      pengelolaEmail: 'ffprojectjkt@gmail.com'
    };

    AFFILIATOR_DB.push(savedRecord);

    if (optionalSyncEndpoint) {
      fetch(optionalSyncEndpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(savedRecord)
      }).catch(() => {});
    }

    // Simpan ID & Nama Registrasi ke browser untuk tampilan header & verifikasi real-time
    try {
      localStorage.setItem(REGISTERED_STORAGE_KEY, 'true');
      localStorage.setItem(REGISTERED_ID_KEY, savedRecord.id);
      localStorage.setItem(REGISTERED_NAME_KEY, savedRecord.namaLengkap);
    } catch (e) {}
    updateUserHeaderUI();

    document.getElementById('modalNamaPendaftar').textContent = savedRecord.namaLengkap;
    document.getElementById('modalIdRegistrasi').textContent = savedRecord.id;
    const modal = document.getElementById('successModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    formEl.reset();
  } catch (err) {
    alert('Maaf, terjadi gangguan saat menyimpan pendaftaran. Pastikan koneksi internet aktif lalu coba lagi.\n\nDetail: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-70', 'cursor-wait');
    submitBtn.innerHTML = originalBtnHtml;
  }
}

function closeSuccessModal() {
  const modal = document.getElementById('successModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// ==================== MODAL KIT PROMOSI (VERIFIKASI REAL-TIME KE SPREADSHEET) ====================
function rejectPromoAccess(triggerBtn, customMessage) {
  if (triggerBtn) {
    triggerBtn.classList.remove('btn-shake');
    void triggerBtn.offsetWidth;
    triggerBtn.classList.add('btn-shake');
    setTimeout(() => triggerBtn.classList.remove('btn-shake'), 500);
  }

  if (navigator.vibrate) {
    navigator.vibrate([80, 40, 80]);
  }

  showLockToast(customMessage);
}

async function togglePromoModal(triggerBtn = null) {
  const modal = document.getElementById('promoModal');
  const isOpening = modal.classList.contains('hidden');

  if (!isOpening) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    return;
  }

  if (isCheckingAccess) return;

  const savedId = getSavedRegistrationId();

  // Jika belum pernah daftar (atau masih pakai data lama tanpa ID), langsung tolak
  if (!savedId) {
    clearSavedRegistration();
    rejectPromoAccess(
      triggerBtn,
      'Silakan mendaftarkan akun Anda terlebih dahulu sebelum menerima & melihat Kit Promosi.'
    );
    return;
  }

  // Verifikasi real-time ke Google Sheets apakah ID user masih ada (belum dihapus admin)
  if (isGoogleScriptConfigured()) {
    isCheckingAccess = true;
    const originalBtnHtml = triggerBtn ? triggerBtn.innerHTML : null;
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Memeriksa akses...';
    }

    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=check&id=${encodeURIComponent(savedId)}`);
      const result = await response.json();

      if (result.status !== 'success' || !result.exists) {
        // ID sudah dihapus oleh admin dari Spreadsheet -> cabut akses & bersihkan browser
        clearSavedRegistration();
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = originalBtnHtml;
        }
        isCheckingAccess = false;
        rejectPromoAccess(
          triggerBtn,
          'Data pendaftaran Anda tidak ditemukan atau telah dihapus oleh pengelola. Silakan mendaftar kembali untuk mengakses Kit Promosi.'
        );
        return;
      }
    } catch (err) {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = originalBtnHtml;
      }
      isCheckingAccess = false;
      rejectPromoAccess(
        triggerBtn,
        'Gagal memverifikasi status pendaftaran. Pastikan koneksi internet aktif lalu coba lagi.'
      );
      return;
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        if (originalBtnHtml !== null) triggerBtn.innerHTML = originalBtnHtml;
      }
      isCheckingAccess = false;
    }
  }

  // Terverifikasi masih terdaftar -> buka Kit Promosi
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function showLockToast(customMessage) {
  const toast = document.getElementById('lockWarningToast');
  if (!toast) return;

  if (customMessage) {
    const paragraphs = toast.querySelectorAll('p');
    if (paragraphs.length >= 2) {
      paragraphs[1].textContent = customMessage;
    }
  }

  toast.classList.remove('hidden');
  clearTimeout(lockToastTimeout);
  lockToastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 5000);
}

function hideLockToast() {
  const toast = document.getElementById('lockWarningToast');
  if (!toast) return;
  toast.classList.add('hidden');
  clearTimeout(lockToastTimeout);
}

// Pindah konten di Modal Kit Promosi berdasarkan pilihan Dropdown
function switchPromoTab(tabName) {
  const panels = {
    properti: document.getElementById('promoTabProperti'),
    pondokAsri: document.getElementById('promoTabPondokAsri'),
    plosokuning: document.getElementById('promoTabPlosokuning'),
    rekrutmen: document.getElementById('promoTabRekrutmen')
  };

  Object.keys(panels).forEach(key => {
    if (!panels[key]) return;
    if (key === tabName) {
      panels[key].classList.remove('hidden');
    } else {
      panels[key].classList.add('hidden');
    }
  });

  const selectEl = document.getElementById('promoTabSelect');
  if (selectEl && selectEl.value !== tabName) {
    selectEl.value = tabName;
  }
}

// Salin teks iklan dari textarea mana saja berdasarkan ID
function copyTextById(textareaId, statusId) {
  const textarea = document.getElementById(textareaId);
  const status = document.getElementById(statusId);
  if (!textarea) return;

  textarea.select();
  textarea.setSelectionRange(0, 99999);

  const showSuccess = () => {
    if (status) {
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 3000);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(textarea.value)
      .then(showSuccess)
      .catch(() => {
        try {
          document.execCommand('copy');
          showSuccess();
        } catch (e) {}
      });
  } else {
    try {
      document.execCommand('copy');
      showSuccess();
    } catch (e) {}
  }
}

// Konversi SVG Banner Rekrutmen ke PNG
function downloadBannerPng() {
  const svgEl = document.getElementById('promoBannerSvg');
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgEl);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 560;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = function () {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const pngUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = 'Banner_Affiliator_FFProjectJKT.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  img.src = url;
}

// ==================== KONTROL ADMIN (TERPROTEKSI PASSWORD) ====================
function openAdminPinModal() {
  document.getElementById('adminPinInput').value = '';
  document.getElementById('pinErrorMsg').classList.add('hidden');
  const modal = document.getElementById('adminPinModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => document.getElementById('adminPinInput').focus(), 100);
}

function closeAdminPinModal() {
  const modal = document.getElementById('adminPinModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function verifyAdminPin(e) {
  e.preventDefault();
  const pin = document.getElementById('adminPinInput').value.trim();
  if (pin === ADMIN_PIN) {
    closeAdminPinModal();
    openAdminDashboard();
  } else {
    document.getElementById('pinErrorMsg').classList.remove('hidden');
  }
}

// Saat Panel Admin dibuka, tarik data terbaru langsung dari Google Sheets
async function openAdminDashboard() {
  const modal = document.getElementById('adminDashboardModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const tbody = document.getElementById('adminTableBody');

  if (isGoogleScriptConfigured()) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-navy-900 font-semibold">
          <i class="fa-solid fa-spinner fa-spin mr-2 text-gold-600"></i>Memuat data terbaru dari Google Sheets...
        </td>
      </tr>
    `;

    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?pin=${encodeURIComponent(ADMIN_PIN)}`);
      const result = await response.json();
      if (result.status === 'success' && Array.isArray(result.data)) {
        AFFILIATOR_DB = result.data;
      }
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="p-8 text-center text-rose-600 font-semibold">
            Gagal memuat data dari Google Sheets. Periksa koneksi internet atau URL Web App Anda.
          </td>
        </tr>
      `;
      return;
    }
  }

  renderAdminTable();
}

function closeAdminDashboard() {
  const modal = document.getElementById('adminDashboardModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function toggleGoogleWebhookConfig() {
  document.getElementById('googleSyncBox').classList.toggle('hidden');
}

function saveWebhookUrl() {
  optionalSyncEndpoint = document.getElementById('webhookUrlInput').value.trim();
  const msg = document.getElementById('webhookStatusMsg');
  msg.textContent = optionalSyncEndpoint
    ? 'URL sinkronisasi berhasil disimpan! Setiap pendaftar baru akan otomatis dikirim.'
    : 'URL sinkronisasi dikosongkan.';
  msg.classList.remove('hidden');
}

function renderAdminTable() {
  const tbody = document.getElementById('adminTableBody');
  document.getElementById('adminTotalCount').textContent = AFFILIATOR_DB.length;

  if (AFFILIATOR_DB.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-500">
          Belum ada pendaftar tersimpan di database.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = AFFILIATOR_DB.map((item, idx) => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-semibold">${idx + 1}</td>
      <td class="p-3">
        <span class="font-mono font-bold text-navy-900 block">${escapeHtml(item.id)}</span>
        <span class="text-[11px] text-slate-500">${escapeHtml(item.waktuDaftar)}</span>
      </td>
      <td class="p-3 font-bold text-navy-900">${escapeHtml(item.namaLengkap)}</td>
      <td class="p-3">${escapeHtml(item.nomorWa)}</td>
      <td class="p-3">${escapeHtml(item.emailAktif)}</td>
      <td class="p-3">${escapeHtml(item.domisili)}</td>
      <td class="p-3">
        <span class="font-semibold text-navy-800 block">${escapeHtml(item.mediaSosial)}</span>
        <span class="text-[11px] text-slate-500">${escapeHtml(item.akunSosmed)}</span>
      </td>
      <td class="p-3 font-medium">${escapeHtml(item.rekeningBank)}</td>
      <td class="p-3 text-center">
        <button
          type="button"
          onclick="deleteAffiliator('${escapeHtml(item.id)}', this)"
          class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 font-semibold text-xs transition inline-flex items-center gap-1"
          title="Hapus data ini dari Google Sheets"
        >
          <i class="fa-solid fa-trash-can"></i> Hapus
        </button>
      </td>
    </tr>
  `).join('');
}

// Hapus data dari Panel Admin sekaligus dari Google Sheets
async function deleteAffiliator(id, btnEl) {
  const target = AFFILIATOR_DB.find(item => item.id === id);
  const nama = target ? target.namaLengkap : id;

  const yakin = confirm(`Yakin ingin menghapus data affiliator:\n${nama} (${id})?\n\nData ini akan langsung terhapus permanen dari Google Sheets.`);
  if (!yakin) return;

  const originalHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.classList.add('opacity-60', 'cursor-wait');
  btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    if (isGoogleScriptConfigured()) {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete',
          pin: ADMIN_PIN,
          id: id
        })
      });

      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal menghapus data di Google Sheets');
      }
    }

    // Jika ID yang dihapus adalah akun di browser ini sendiri, langsung cabut aksesnya
    if (getSavedRegistrationId() === id) {
      clearSavedRegistration();
    }

    AFFILIATOR_DB = AFFILIATOR_DB.filter(item => item.id !== id);
    renderAdminTable();
  } catch (err) {
    alert('Gagal menghapus data: ' + err.message);
    btnEl.disabled = false;
    btnEl.classList.remove('opacity-60', 'cursor-wait');
    btnEl.innerHTML = originalHtml;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Export Database ke Format Excel (.xls)
function exportToExcelFile() {
  const rows = AFFILIATOR_DB.length > 0 ? AFFILIATOR_DB : [{
    id: 'CONTOH-001',
    waktuDaftar: '-',
    namaLengkap: '(Belum ada data pendaftar)',
    nomorWa: '-',
    emailAktif: '-',
    domisili: '-',
    mediaSosial: '-',
    akunSosmed: '-',
    rekeningBank: '-',
    persenPengelola: '2%',
    persenAffiliator: '10% dari Komisi Pengelola',
    pengelolaEmail: 'ffprojectjkt@gmail.com'
  }];

  let tableHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"></head>
    <body>
      <table border="1">
        <thead>
          <tr style="background-color:#0B192C; color:#FFFFFF; font-weight:bold;">
            <th>No</th>
            <th>ID Registrasi</th>
            <th>Waktu Pendaftaran</th>
            <th>Nama Lengkap (Sesuai KTP)</th>
            <th>Nomor WhatsApp</th>
            <th>Email Aktif</th>
            <th>Domisili (Kota/Kabupaten)</th>
            <th>Media Sosial Utama</th>
            <th>Link / Username Akun</th>
            <th>Nama Bank &amp; No. Rekening</th>
            <th>Komisi Pengelola</th>
            <th>Komisi Affiliator</th>
            <th>Akun Pengelola</th>
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach((r, i) => {
    tableHtml += `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.id)}</td>
        <td>${escapeHtml(r.waktuDaftar)}</td>
        <td>${escapeHtml(r.namaLengkap)}</td>
        <td>'${escapeHtml(r.nomorWa)}</td>
        <td>${escapeHtml(r.emailAktif)}</td>
        <td>${escapeHtml(r.domisili)}</td>
        <td>${escapeHtml(r.mediaSosial)}</td>
        <td>${escapeHtml(r.akunSosmed)}</td>
        <td>${escapeHtml(r.rekeningBank)}</td>
        <td>${escapeHtml(r.persenPengelola)}</td>
        <td>${escapeHtml(r.persenAffiliator)}</td>
        <td>${escapeHtml(r.pengelolaEmail)}</td>
      </tr>
    `;
  });

  tableHtml += `</tbody></table></body></html>`;

  const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Database_Affiliator_FFProjectJKT_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export Database ke Format CSV
function exportToCsvFile() {
  const headers = [
    'No', 'ID Registrasi', 'Waktu Pendaftaran', 'Nama Lengkap (KTP)',
    'Nomor WhatsApp', 'Email Aktif', 'Domisili', 'Media Sosial Utama',
    'Link/Username Akun', 'Bank & Nomor Rekening', 'Komisi Pengelola',
    'Komisi Affiliator', 'Pengelola'
  ];

  const csvLines = [headers.join(',')];
  AFFILIATOR_DB.forEach((r, i) => {
    const line = [
      i + 1,
      `"${r.id}"`,
      `"${r.waktuDaftar}"`,
      `"${r.namaLengkap.replace(/"/g, '""')}"`,
      `"${r.nomorWa}"`,
      `"${r.emailAktif}"`,
      `"${r.domisili.replace(/"/g, '""')}"`,
      `"${r.mediaSosial}"`,
      `"${r.akunSosmed.replace(/"/g, '""')}"`,
      `"${r.rekeningBank.replace(/"/g, '""')}"`,
      `"${r.persenPengelola}"`,
      `"${r.persenAffiliator}"`,
      `"${r.pengelolaEmail}"`
    ];
    csvLines.push(line.join(','));
  });

  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Database_Affiliator_FFProjectJKT_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Inisialisasi simulasi awal & tampilan nama user saat halaman dimuat
window.addEventListener('DOMContentLoaded', () => {
  hitungSimulasi(500000000);
  updateUserHeaderUI();
  verifySavedRegistrationOnLoad();
});