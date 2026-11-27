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
  updateSimulasiLockUI();
  switchMainTab('pendaftaran');
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

// Kunci / Buka akses input & dropdown Simulasi Komisi sesuai status registrasi
function updateSimulasiLockUI() {
  const inputEl = document.getElementById('inputNilaiRumah');
  const selectEl = document.getElementById('selectHargaSimulasi');
  const isRegistered = Boolean(getSavedRegistrationId());

  if (inputEl) {
    inputEl.readOnly = !isRegistered;
    if (!isRegistered) {
      inputEl.value = '0';
    }
  }
  if (selectEl && !isRegistered) {
    selectEl.value = '';
  }
  if (!isRegistered) {
    hitungSimulasi(0);
  }
}

// Cek otomatis ke Google Sheets saat halaman dibuka agar akses & nama dicabut jika dihapus admin
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

// Cegah akses Simulasi Komisi jika user belum terdaftar (efek getar + peringatan)
function handleLockedSimulasiClick(event, el) {
  if (!getSavedRegistrationId()) {
    if (event) event.preventDefault();
    if (el && el.blur) el.blur();
    rejectAccess(
      el,
      'Akses Simulasi Komisi Terkunci!',
      'Silakan mendaftarkan akun Anda terlebih dahulu untuk menggunakan fitur Simulasi Komisi.'
    );
    return true;
  }
  return false;
}

// Handler pilihan Dropdown Simulasi Cepat
function handleSelectHargaChange(selectEl) {
  if (!getSavedRegistrationId()) {
    selectEl.value = '';
    document.getElementById('inputNilaiRumah').value = '0';
    hitungSimulasi(0);
    rejectAccess(
      selectEl,
      'Akses Simulasi Komisi Terkunci!',
      'Silakan mendaftarkan akun Anda terlebih dahulu untuk menggunakan fitur Simulasi Komisi.'
    );
    return;
  }

  if (selectEl.value) {
    setHargaSimulasi(Number(selectEl.value));
  } else {
    document.getElementById('inputNilaiRumah').value = '0';
    hitungSimulasi(0);
  }
}

// Handler saat user mengetik manual di kolom Nilai Rumah Terjual
function handleHargaInput(inputEl) {
  if (!getSavedRegistrationId()) {
    inputEl.value = '0';
    hitungSimulasi(0);
    rejectAccess(
      inputEl,
      'Akses Simulasi Komisi Terkunci!',
      'Silakan mendaftarkan akun Anda terlebih dahulu untuk menggunakan fitur Simulasi Komisi.'
    );
    return;
  }

  const rawDigits = inputEl.value.replace(/\D/g, '');
  const numericValue = parseInt(rawDigits, 10) || 0;
  inputEl.value = rawDigits ? formatRibuan(numericValue) : '0';
  hitungSimulasi(numericValue);

  const selectEl = document.getElementById('selectHargaSimulasi');
  if (selectEl) {
    const matchOption = Array.from(selectEl.options).some(opt => opt.value === String(numericValue));
    selectEl.value = matchOption ? String(numericValue) : '';
  }
}

// Handler pilihan Dropdown cepat harga properti
function setHargaSimulasi(nominal) {
  if (!getSavedRegistrationId()) {
    updateSimulasiLockUI();
    return;
  }

  const inputEl = document.getElementById('inputNilaiRumah');
  inputEl.value = formatRibuan(nominal);
  hitungSimulasi(nominal);

  const selectEl = document.getElementById('selectHargaSimulasi');
  if (selectEl) {
    const matchOption = Array.from(selectEl.options).some(opt => opt.value === String(nominal));
    selectEl.value = matchOption ? String(nominal) : '';
  }
}

// ==================== NAVIGASI UTAMA & KUNCI FORM PERJANJIAN VISIT ====================
async function openVisitTab(triggerBtn = null) {
  if (isCheckingAccess) return;

  const savedId = getSavedRegistrationId();

  // Tolak akses jika user belum mendaftar
  if (!savedId) {
    clearSavedRegistration();
    rejectAccess(
      triggerBtn,
      'Akses Form Perjanjian Visit Terkunci!',
      'Silakan mendaftarkan akun Anda terlebih dahulu sebelum menggunakan Form Perjanjian Visit Properti.'
    );
    return;
  }

  // Verifikasi real-time ke Google Sheets apakah ID masih terdaftar
  if (isGoogleScriptConfigured()) {
    isCheckingAccess = true;
    const originalBtnHtml = triggerBtn ? triggerBtn.innerHTML : null;
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memeriksa...</span>';
    }

    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=check&id=${encodeURIComponent(savedId)}`);
      const result = await response.json();

      if (result.status !== 'success' || !result.exists) {
        clearSavedRegistration();
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = originalBtnHtml;
        }
        isCheckingAccess = false;
        rejectAccess(
          triggerBtn,
          'Akses Form Perjanjian Visit Terkunci!',
          'Data pendaftaran Anda tidak ditemukan atau telah dihapus oleh pengelola. Silakan mendaftar kembali untuk mengakses Form Perjanjian Visit.'
        );
        return;
      }
    } catch (err) {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = originalBtnHtml;
      }
      isCheckingAccess = false;
      rejectAccess(
        triggerBtn,
        'Gagal Memeriksa Akses!',
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

  switchMainTab('visit');
}

function switchMainTab(tabName) {
  const tabPendaftaran = document.getElementById('mainTabPendaftaran');
  const tabVisit = document.getElementById('mainTabVisit');
  const btnVisitHeader = document.getElementById('btnVisitHeader');
  if (!tabPendaftaran || !tabVisit) return;

  if (tabName === 'visit') {
    if (!getSavedRegistrationId()) return;
    tabPendaftaran.classList.add('hidden');
    tabVisit.classList.remove('hidden');
    if (btnVisitHeader) {
      btnVisitHeader.className = 'inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold px-3.5 py-2 rounded-lg gold-gradient text-navy-950 ring-2 ring-white/80 shadow hover:opacity-95 transition whitespace-nowrap';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    tabVisit.classList.add('hidden');
    tabPendaftaran.classList.remove('hidden');
    if (btnVisitHeader) {
      btnVisitHeader.className = 'inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold px-3.5 py-2 rounded-lg gold-gradient text-navy-950 shadow hover:opacity-95 transition whitespace-nowrap';
    }
  }
}

// Scroll halus ke section tertentu & langsung fokus ke input Nama Lengkap jika klik Daftar Sekarang
function scrollToSection(id) {
  switchMainTab('pendaftaran');

  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Jika menuju form pendaftaran, langsung aktifkan kursor ketik di kolom Nama Lengkap
  if (id === 'form-section') {
    const namaInput = document.getElementById('namaLengkap');
    if (namaInput) {
      // Fokus langsung di event klik agar kursor & keyboard HP langsung aktif tanpa merusak animasi scroll
      namaInput.focus({ preventScroll: true });

      // Pastikan tetap terfokus setelah animasi smooth scroll selesai
      setTimeout(() => {
        namaInput.focus({ preventScroll: true });
      }, 450);
    }
  }
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

    // Simpan ID & Nama Registrasi ke browser -> langsung buka akses Kit Promosi, Simulasi Komisi & Form Visit
    try {
      localStorage.setItem(REGISTERED_STORAGE_KEY, 'true');
      localStorage.setItem(REGISTERED_ID_KEY, savedRecord.id);
      localStorage.setItem(REGISTERED_NAME_KEY, savedRecord.namaLengkap);
    } catch (e) {}
    updateUserHeaderUI();
    updateSimulasiLockUI();

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

// ==================== PENOLAKAN AKSES & MODAL KIT PROMOSI ====================
function rejectAccess(triggerEl, customTitle, customMessage) {
  if (triggerEl) {
    triggerEl.classList.remove('btn-shake');
    void triggerEl.offsetWidth;
    triggerEl.classList.add('btn-shake');
    setTimeout(() => triggerEl.classList.remove('btn-shake'), 500);
  }

  if (navigator.vibrate) {
    navigator.vibrate([80, 40, 80]);
  }

  showLockToast(customTitle, customMessage);
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

  if (!savedId) {
    clearSavedRegistration();
    rejectAccess(
      triggerBtn,
      'Akses Kit Promosi Terkunci!',
      'Silakan mendaftarkan akun Anda terlebih dahulu sebelum menerima & melihat Kit Promosi.'
    );
    return;
  }

  if (isGoogleScriptConfigured()) {
    isCheckingAccess = true;
    const originalBtnHtml = triggerBtn ? triggerBtn.innerHTML : null;
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memeriksa...</span>';
    }

    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=check&id=${encodeURIComponent(savedId)}`);
      const result = await response.json();

      if (result.status !== 'success' || !result.exists) {
        clearSavedRegistration();
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = originalBtnHtml;
        }
        isCheckingAccess = false;
        rejectAccess(
          triggerBtn,
          'Akses Kit Promosi Terkunci!',
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
      rejectAccess(
        triggerBtn,
        'Gagal Memeriksa Akses!',
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

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function showLockToast(customTitle, customMessage) {
  const toast = document.getElementById('lockWarningToast');
  if (!toast) return;

  const paragraphs = toast.querySelectorAll('p');
  if (customTitle && paragraphs.length >= 1) {
    paragraphs[0].textContent = customTitle;
  }
  if (customMessage && paragraphs.length >= 2) {
    paragraphs[1].textContent = customMessage;
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

// ==================== FORM PERJANJIAN VISIT PROPERTI (EXPORT PDF A4) ====================
function handleVisitPropertiPreset(key) {
  const presets = {
    jayagiri: {
      nama: 'Hotel Jayagiri & Boutique (20 Kamar, SHM, Furnished)',
      harga: 'Rp 14.000.000.000 (Nego Langsung Pemilik)',
      alamat: 'Jl. Raya Tangkuban Parahu No.217A, Cikole, Lembang, Kab. Bandung Barat, Jawa Barat 40391'
    },
    pondokasri: {
      nama: 'Pondok Asri Purwakarta (Villa & Lahan LT 3.214 m2)',
      harga: 'Rp 8.000.000.000',
      alamat: 'Jl. Kapten Halim Terusan Km. 9,9 No. 2, Desa Salam Mulya, Kec. Pondok Salam, Kab. Purwakarta'
    },
    plosokuning: {
      nama: 'Rumah 2 Lantai Plosokuning IV (4 KT / 3 KM, LT 145 m2 / LB 290 m2)',
      harga: 'Rp 2.600.000.000',
      alamat: 'Jl. Plosokuning IV, Minomartani, Kec. Ngaglik, Kab. Sleman, DI Yogyakarta'
    }
  };

  if (presets[key]) {
    document.getElementById('visitNamaProperti').value = presets[key].nama;
    document.getElementById('visitHargaProperti').value = presets[key].harga;
    document.getElementById('visitAlamatProperti').value = presets[key].alamat;
  } else {
    document.getElementById('visitNamaProperti').value = '';
    document.getElementById('visitHargaProperti').value = '';
    document.getElementById('visitAlamatProperti').value = '';
  }
}

function getLogoPngDataUrl() {
  return new Promise((resolve) => {
    const svgEl = document.getElementById('visitLogoSvg');
    if (!svgEl) return resolve(null);
    const svgString = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, 240, 240);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function handleVisitFormSubmit(event) {
  event.preventDefault();

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('Library PDF sedang dimuat. Pastikan koneksi internet aktif lalu coba klik simpan kembali.');
    return;
  }

  const formEl = document.getElementById('visitPropertyForm');
  const submitBtn = formEl.querySelector('button[type="submit"]');
  const originalBtnHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Membuat File PDF A4...</span>';

  try {
    const data = {
      namaAgen: document.getElementById('visitNamaAgen').value.trim(),
      waAgen: document.getElementById('visitWaAgen').value.trim(),
      idAgen: document.getElementById('visitIdAgen').value.trim() || '-',
      emailAgen: document.getElementById('visitEmailAgen').value.trim(),
      namaBuyer: document.getElementById('visitNamaBuyer').value.trim(),
      waBuyer: document.getElementById('visitWaBuyer').value.trim(),
      domisiliBuyer: document.getElementById('visitDomisiliBuyer').value.trim(),
      ktpBuyer: document.getElementById('visitKtpBuyer').value.trim() || '-',
      namaProperti: document.getElementById('visitNamaProperti').value.trim(),
      hargaProperti: document.getElementById('visitHargaProperti').value.trim(),
      alamatProperti: document.getElementById('visitAlamatProperti').value.trim(),
      tanggalVisit: document.getElementById('visitTanggal').value,
      jamVisit: document.getElementById('visitJam').value + ' WIB',
      catatan: document.getElementById('visitCatatan').value.trim() || '-'
    };

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const tanggalBuat = `${yyyy}-${mm}-${dd}`;
    const safeNamaAgen = data.namaAgen.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const fileName = `Perjanjian_Visit_${safeNamaAgen}_${tanggalBuat}.pdf`;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 14;

    const logoDataUrl = await getLogoPngDataUrl();
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 15, y, 22, 22);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(11, 25, 44);
    doc.text('FFProjectJKT PROPERTY AFFILIATE NETWORK', 42, y + 7);

    doc.setFontSize(11);
    doc.setTextColor(176, 141, 38);
    doc.text('FORM PERJANJIAN VISIT PROPERTI', 42, y + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text('Pengelola Resmi: FFProjectJKT | Email: ffprojectjkt@gmail.com | Telp/WA: +62 813-8500-5657', 42, y + 19);

    y += 26;
    doc.setDrawColor(11, 25, 44);
    doc.setLineWidth(0.9);
    doc.line(15, y, pageW - 15, y);
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.5);
    doc.line(15, y + 1.5, pageW - 15, y + 1.5);

    y += 8;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(15, y, pageW - 30, 18, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(11, 25, 44);
    doc.text('Kepada Yth. Pengelola / Pemilik Iklan (FFProjectJKT - ffprojectjkt@gmail.com)', 19, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(55, 65, 81);
    doc.text('Untuk disampaikan secara resmi kepada Pihak Pemilik Properti terkait permohonan survei/visit lokasi.', 19, y + 11.5);
    doc.text(`Tanggal Pembuatan Dokumen: ${dd}/${mm}/${yyyy}`, 19, y + 16);

    y += 24;

    const drawSectionHeader = (title) => {
      doc.setFillColor(11, 25, 44);
      doc.rect(15, y, pageW - 30, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(253, 224, 141);
      doc.text(title, 18, y + 4.8);
      y += 10.5;
    };

    const drawField = (label, value) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      doc.text(label, 18, y);
      doc.text(':', 68, y);

      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value || '-'), pageW - 88);
      doc.text(lines, 71, y);
      y += Math.max(5.5, lines.length * 4.8);
    };

    drawSectionHeader('A. DATA AGEN / AFFILIATOR PENGAJU');
    drawField('Nama Agen / Affiliator', data.namaAgen);
    drawField('ID Registrasi Affiliator', data.idAgen);
    drawField('Nomor WhatsApp', data.waAgen);
    drawField('Alamat Email', data.emailAgen);
    y += 3;

    drawSectionHeader('B. DATA CALON PEMBELI (BUYER)');
    drawField('Nama Lengkap Buyer', data.namaBuyer);
    drawField('Nomor HP / WhatsApp', data.waBuyer);
    drawField('Domisili / Alamat', data.domisiliBuyer);
    drawField('No. KTP / Identitas', data.ktpBuyer);
    y += 3;

    drawSectionHeader('C. DATA PROPERTI & JADWAL VISIT');
    drawField('Nama / Jenis Properti', data.namaProperti);
    drawField('Harga Penawaran', data.hargaProperti);
    drawField('Alamat Lokasi Properti', data.alamatProperti);
    drawField('Jadwal Rencana Visit', `${data.tanggalVisit} pukul ${data.jamVisit}`);
    drawField('Catatan Tambahan', data.catatan);
    y += 3;

    drawSectionHeader('D. KLAUSUL STANDAR PERJANJIAN VISIT PROPERTI');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(55, 65, 81);
    const klausulList = [
      '1. Calon pembeli yang tercantum di atas diakui sebagai referensi sah dari Agen/Affiliator melalui Pengelola FFProjectJKT selama 90 (sembilan puluh) hari kalender sejak tanggal visit.',
      '2. Calon pembeli dan/atau perwakilannya tidak diperkenankan melakukan negosiasi atau transaksi langsung (bypass) dengan Pemilik Properti tanpa melalui Pengelola FFProjectJKT.',
      '3. Pelaksanaan survei lokasi wajib dikoordinasikan bersama Pengelola FFProjectJKT, serta dilarang melakukan mark-up harga tanpa izin tertulis dari Pengelola.',
      '4. Dokumen ini dibuat secara sadar sebagai bukti administrasi resmi pengajuan survei properti.'
    ];

    klausulList.forEach((k) => {
      const lines = doc.splitTextToSize(k, pageW - 34);
      doc.text(lines, 17, y);
      y += lines.length * 4 + 1.5;
    });

    y = Math.max(y + 8, 248);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(11, 25, 44);

    doc.text('Diajukan oleh,', 38, y, { align: 'center' });
    doc.text('Agen / Affiliator', 38, y + 4.5, { align: 'center' });

    doc.text('Menyetujui,', 105, y, { align: 'center' });
    doc.text('Calon Pembeli (Buyer)', 105, y + 4.5, { align: 'center' });

    doc.text('Mengetahui,', 172, y, { align: 'center' });
    doc.text('Pengelola FFProjectJKT', 172, y + 4.5, { align: 'center' });

    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);
    doc.line(18, y + 23, 58, y + 23);
    doc.line(85, y + 23, 125, y + 23);
    doc.line(152, y + 23, 192, y + 23);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(data.namaAgen, 38, y + 27.5, { align: 'center' });
    doc.text(data.namaBuyer, 105, y + 27.5, { align: 'center' });
    doc.text('Ferry Ferdyana (FFProjectJKT)', 172, y + 27.5, { align: 'center' });

    doc.save(fileName);

    document.getElementById('visitSavedFileName').textContent = fileName;
    const banner = document.getElementById('visitPdfSuccessBanner');
    banner.classList.remove('hidden');
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });

    formEl.reset();
  } catch (err) {
    alert('Gagal membuat file PDF: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;
  }
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

// Inisialisasi awal saat halaman dimuat (default simulasi Rp 0 & cek kunci akses)
window.addEventListener('DOMContentLoaded', () => {
  hitungSimulasi(0);
  updateUserHeaderUI();
  updateSimulasiLockUI();
  verifySavedRegistrationOnLoad();
});