console.log("Interceptor Aktif (Mode Catch-All Form & Keepalive)...");

// MENGGUNAKAN MODE SUBMIT + CAPTURING PHASE ('true')
document.addEventListener('submit', (event) => {
    // TANGKAP SEMUA TAG <FORM> TANPA MEMPEDULIKAN ID-NYA!
    const formElement = event.target.closest('form'); 
    
    if (formElement) {
        const formData = new FormData(formElement);
        const dataPayload = Object.fromEntries(formData.entries());
        
        const payload = {
            form_id: formElement.id || "form_dinamis",
            timestamp: new Date().toISOString(),
            data: dataPayload
        };
        
        kirimKeLocalServer(payload);
    }
}, true); // <-- KATA 'true' INI SANGAT PENTING UNTUK MENANGKAP KLIK SEBELUM BROWSER REFRESH

function kirimKeLocalServer(payload) {
    fetch('http://localhost:3000/api/intercept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true // <-- MENCEGAH ERROR "FAILED TO FETCH"
    }).catch(err => console.error("Gagal mengirim data:", err));
}

// ==========================================
// FLOATING DRAG-AND-DROP UI UNTUK OCR (MULTI-FILE)
// ==========================================

// ---- Pemetaan nama file → doc_type ----
// Urutan penting: lebih spesifik dulu (ktp_pembeli sebelum ktp)
const DOC_TYPE_RULES = [
    // Spesifik dulu (ktp_pembeli sebelum ktp generik)
    { pattern: /ktp[\s_-]*persetujuan|persetujuan/i,          type: 'ktp_persetujuan'        },
    { pattern: /ktp[\s_-]*pembeli/i,                          type: 'ktp_pembeli'            },
    { pattern: /ktp[\s_-]*saksi/i,                            type: 'ktp_saksi'              },
    { pattern: /ktp[\s_-]*penjual/i,                          type: 'ktp_penjual'            },
    { pattern: /^ktp$/i,                                      type: 'ktp_pembeli'            }, // KTP polos → default pembeli
    { pattern: /npwp/i,                                       type: 'npwp_penjual'           },
    { pattern: /akta[\s_-]*pendirian|pendirian/i,             type: 'akta_pendirian_penjual' },
    { pattern: /kartu[\s_-]*keluarga|^kk$/i,                  type: 'kk_pembeli'             }, // KK polos dikenali
    { pattern: /kode[\s_-]*berkas|berkas[\s_-]*cek|^cek$/i,   type: 'kode_berkas_cek'        }, // Cek polos dikenali
    { pattern: /keabsahan/i,                                  type: 'keabsahan'              },
    { pattern: /sertif|sertipikat|^hat$/i,                    type: 'sertifikat'             },
    { pattern: /bphtb/i,                                      type: 'bphtb'                  },
    { pattern: /pph|ssp/i,                                    type: 'pph'                    },
    { pattern: /pbb/i,                                        type: 'pbb'                    },
    { pattern: /ajb|akta[\s_-]*jual/i,                        type: 'ajb'                    },
    { pattern: /pembeli/i,                                    type: 'ktp_pembeli'            }, // fallback
    { pattern: /saksi/i,                                      type: 'ktp_saksi'              }, // fallback
    { pattern: /penjual/i,                                    type: 'ktp_penjual'            }, // fallback
];

const DOC_TYPE_LABELS = {
    ajb:                   '📄 AJB',
    ktp_penjual:           '🪪 KTP Penjual',
    ktp_persetujuan:       '🪪 KTP Persetujuan',
    ktp_pembeli:           '🪪 KTP Pembeli',
    ktp_saksi:             '🪪 KTP Saksi',
    npwp_penjual:          '📋 NPWP Penjual',
    akta_pendirian_penjual:'📑 Akta Pendirian',
    kk_pembeli:            '📋 KK Pembeli',
    kode_berkas_cek:       '🔍 Kode Berkas Cek',
    keabsahan:             '📋 Keabsahan',
    sertifikat:            '📜 Sertifikat',
    pbb:                   '🏠 PBB',
    bphtb:                 '💰 BPHTB',
    pph:                   '🧾 SSP/PPh',
    unknown:               '❓ Tidak Dikenali',
};

function detectDocType(filename) {
    const name = filename.toLowerCase().replace(/\.[^.]+$/, ''); // tanpa ekstensi
    for (const rule of DOC_TYPE_RULES) {
        if (rule.pattern.test(name)) return rule.type;
    }
    return 'unknown';
}

// ---- Deteksi Akta ID dari halaman ----
function detectAktaId() {
    const selectors = [
        '#aktaid', 'input[name="aktaid"]',
        '#AktaId', 'input[name="AktaId"]',
        '[id*="aktaid" i]', '[name*="aktaid" i]'
    ];
    for (const sel of selectors) {
        try {
            const el = document.querySelector(sel);
            if (el && el.value && el.value.trim() !== '') return el.value.trim();
        } catch (_) {}
    }
    return null;
}

// ---- State antrean upload ----
let uploadQueue = []; // { file, docType, status: 'pending'|'uploading'|'done'|'error'|'unknown', message }

function injectDropzone() {
    if (document.getElementById('ai-ocr-dropzone')) return;

    const dropzone = document.createElement('div');
    dropzone.id = 'ai-ocr-dropzone';

    dropzone.innerHTML = `
        <div id="ai-ocr-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; cursor:move; user-select:none;">
            <span style="font-weight:700; font-size:13px; color:#1a1a2e;">🤖 AI OCR Dataset</span>
            <span id="ai-ocr-toggle" title="Minimize" style="cursor:pointer; font-size:18px; color:#888; line-height:1; padding:0 2px;">─</span>
        </div>
        <div id="ai-ocr-body" style="display:flex; flex-direction:column; overflow:hidden; flex:1;">
            <div id="ai-akta-display" style="background:#f0f4ff; border-radius:6px; padding:6px 10px; margin-bottom:10px; font-size:11px; color:#555; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                <span>Akta ID:</span>
                <strong id="ai-akta-id-val" style="color:#e53935;">Belum terdeteksi</strong>
            </div>

            <div id="ai-drop-area" style="
                border: 2px dashed #4CAF50; border-radius:8px; padding:18px 12px;
                text-align:center; color:#388e3c; background:#f1f8e9;
                cursor:pointer; transition: background 0.2s, border-color 0.2s; font-size:12px; flex-shrink:0;">
                <div style="font-size:26px; margin-bottom:4px;">📂</div>
                <div style="font-weight:600;">Tarik &amp; Lepas File ke Sini</div>
                <div style="color:#999; font-size:10px; margin-top:3px;">Atau klik untuk memilih • PDF, JPG, PNG</div>
                <div style="color:#aaa; font-size:10px;">Nama file menentukan jenis dokumen</div>
            </div>

            <div id="ai-queue-list" style="margin-top:8px; overflow-y:auto; display:none; flex:1; min-height:0;"></div>

            <div id="ai-actions" style="margin-top:8px; display:none; gap:6px; flex-direction:column; flex-shrink:0;">
                <button id="ai-upload-all-btn" style="
                    width:100%; padding:8px; border:none; border-radius:7px;
                    background:linear-gradient(135deg,#43a047,#2e7d32); color:white;
                    font-weight:700; font-size:12px; cursor:pointer; transition:opacity 0.2s;">
                    ⚡ Upload Semua (0 file)
                </button>
                <button id="ai-clear-btn" style="
                    width:100%; padding:5px; border:1px solid #ddd; border-radius:7px;
                    background:white; color:#888; font-size:11px; cursor:pointer;">
                    🗑 Bersihkan Antrean
                </button>
            </div>
            <div id="ai-global-status" style="margin-top:6px; font-size:11px; color:#888; text-align:center; min-height:14px; flex-shrink:0;"></div>
        </div>
        <div id="ai-resize-handle" title="Seret untuk resize" style="
            position:absolute; bottom:0; right:0; width:18px; height:18px; cursor:nwse-resize;
            display:flex; align-items:flex-end; justify-content:flex-end; padding:2px;
            color:#bbb; font-size:10px; user-select:none; line-height:1;">⟋</div>
    `;

    Object.assign(dropzone.style, {
        position: 'fixed', bottom: '20px', left: '20px', zIndex: '2147483647',
        background: 'white', padding: '14px', borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
        width: '250px', minWidth: '200px', maxWidth: '500px',
        minHeight: '120px', maxHeight: '80vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid #e8eaf6',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
    });

    document.body.appendChild(dropzone);

    // ---- Referensi elemen ----
    const dropArea      = document.getElementById('ai-drop-area');
    const queueList     = document.getElementById('ai-queue-list');
    const actionsDiv    = document.getElementById('ai-actions');
    const uploadAllBtn  = document.getElementById('ai-upload-all-btn');
    const clearBtn      = document.getElementById('ai-clear-btn');
    const globalStatus  = document.getElementById('ai-global-status');
    const aktaIdVal     = document.getElementById('ai-akta-id-val');
    const toggleBtn     = document.getElementById('ai-ocr-toggle');
    const body          = document.getElementById('ai-ocr-body');
    const header        = document.getElementById('ai-ocr-header');
    const resizeHandle  = document.getElementById('ai-resize-handle');

    // ---- Deteksi Akta ID ----
    function refreshAktaDisplay() {
        const id = detectAktaId();
        if (id) {
            aktaIdVal.textContent = id;
            aktaIdVal.style.color = '#2e7d32';
        } else {
            aktaIdVal.textContent = 'Belum terdeteksi';
            aktaIdVal.style.color = '#e53935';
        }
    }
    refreshAktaDisplay();
    setInterval(refreshAktaDisplay, 2000);

    // ---- Minimize ----
    let isMinimized = false;
    toggleBtn.addEventListener('click', () => {
        isMinimized = !isMinimized;
        body.style.display = isMinimized ? 'none' : 'block';
        toggleBtn.textContent = isMinimized ? '+' : '─';
    });

    // ---- Drag-to-move ----
    let isDragging = false, ox = 0, oy = 0;
    header.addEventListener('mousedown', (e) => {
        if (e.target === toggleBtn) return;
        isDragging = true;
        const r = dropzone.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        dropzone.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        dropzone.style.left   = (e.clientX - ox) + 'px';
        dropzone.style.top    = (e.clientY - oy) + 'px';
        dropzone.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; isResizing = false; });

    // ---- Resize ----
    let isResizing = false, startW = 0, startH = 0, startX = 0, startY = 0;
    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        const rect = dropzone.getBoundingClientRect();
        startW = rect.width; startH = rect.height;
        startX = e.clientX; startY = e.clientY;
        dropzone.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newW = Math.max(200, Math.min(500, startW + (e.clientX - startX)));
        const newH = Math.max(120, Math.min(window.innerHeight * 0.8, startH + (e.clientY - startY)));
        dropzone.style.width  = newW + 'px';
        dropzone.style.height = newH + 'px';
    });

    // ---- Drag-and-Drop Events ----
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
        dropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); })
    );
    ['dragenter', 'dragover'].forEach(evt => dropArea.addEventListener(evt, () => {
        dropArea.style.background = '#c8e6c9'; dropArea.style.borderColor = '#2e7d32';
    }));
    ['dragleave', 'drop'].forEach(evt => dropArea.addEventListener(evt, () => {
        dropArea.style.background = '#f1f8e9'; dropArea.style.borderColor = '#4CAF50';
    }));

    dropArea.addEventListener('drop', (e) => addFiles(Array.from(e.dataTransfer.files)));

    // Klik untuk pilih file (multiple)
    dropArea.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*,.pdf'; input.multiple = true;
        input.onchange = (e) => addFiles(Array.from(e.target.files));
        input.click();
    });

    // ---- Render Antrean ----
    function renderQueue() {
        if (uploadQueue.length === 0) {
            queueList.style.display = 'none';
            actionsDiv.style.display = 'none';
            queueList.innerHTML = '';
            return;
        }

        queueList.style.display = 'block';
        actionsDiv.style.display = 'flex';

        const pending = uploadQueue.filter(q => q.status === 'pending' || q.status === 'unknown').length;
        uploadAllBtn.textContent = `⚡ Upload Semua (${pending} file)`;
        uploadAllBtn.disabled = pending === 0;
        uploadAllBtn.style.opacity = pending === 0 ? '0.5' : '1';

        queueList.innerHTML = uploadQueue.map((item, idx) => {
            const label = DOC_TYPE_LABELS[item.docType] || item.docType;
            const statusIcon = {
                pending:   '⏳',
                uploading: '<span style="animation:spin 1s linear infinite;display:inline-block">⚙️</span>',
                done:      '✅',
                error:     '❌',
                unknown:   '❓',
            }[item.status] || '⏳';

            const statusColor = {
                pending:   '#888',
                uploading: '#1565c0',
                done:      '#2e7d32',
                error:     '#c62828',
                unknown:   '#e65100',
            }[item.status] || '#888';

            const shortName = item.file.name.length > 22
                ? item.file.name.slice(0, 19) + '...'
                : item.file.name;

            return `
                <div style="display:flex; align-items:flex-start; gap:6px; padding:6px 0; border-bottom:1px solid #f0f0f0; font-size:11px;">
                    <span style="min-width:18px; text-align:center;">${statusIcon}</span>
                    <div style="flex:1; overflow:hidden;">
                        <div style="color:#333; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.file.name}">${shortName}</div>
                        <div style="color:${item.docType === 'unknown' ? '#e65100' : '#555'};">${label}</div>
                        ${item.message ? `<div style="color:${statusColor}; font-size:10px;">${item.message}</div>` : ''}
                    </div>
                    ${item.status === 'pending' || item.status === 'unknown'
                        ? `<span data-remove="${idx}" style="cursor:pointer; color:#ccc; font-size:14px; padding:0 2px;" title="Hapus">×</span>`
                        : ''}
                </div>
            `;
        }).join('');

        // Tombol hapus per item
        queueList.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.remove);
                uploadQueue.splice(i, 1);
                renderQueue();
            });
        });
    }

    // ---- Tambah file ke antrean ----
    function addFiles(files) {
        for (const file of files) {
            const docType = detectDocType(file.name);
            uploadQueue.push({
                file,
                docType,
                status: docType === 'unknown' ? 'unknown' : 'pending',
                message: docType === 'unknown' ? 'Nama file tidak dikenali' : '',
            });
        }
        renderQueue();
        globalStatus.textContent = `${files.length} file ditambahkan ke antrean.`;
        setTimeout(() => { globalStatus.textContent = ''; }, 3000);
    }

    // ---- Upload satu file ----
    async function uploadFile(item) {
        const aktaId = detectAktaId();
        if (!aktaId) {
            item.status = 'error';
            item.message = 'Akta ID tidak ditemukan!';
            renderQueue();
            return false;
        }
        if (item.docType === 'unknown') {
            item.status = 'error';
            item.message = 'Jenis dokumen tidak dikenali';
            renderQueue();
            return false;
        }

        item.status = 'uploading';
        item.message = '';
        renderQueue();

        const formData = new FormData();
        formData.append('file', item.file, item.file.name);
        formData.append('akta_id', aktaId);
        formData.append('doc_type', item.docType);

        try {
            const response = await fetch('http://localhost:3000/api/upload-ocr', {
                method: 'POST',
                body: formData,
            });
            const json = await response.json();
            if (response.ok && json.status === 'success') {
                item.status = 'done';
                item.message = `${json.chars_extracted ?? '?'} karakter`;
                return true;
            } else {
                item.status = 'error';
                item.message = json.error || 'Server error';
                return false;
            }
        } catch (_) {
            item.status = 'error';
            item.message = 'Server offline';
            return false;
        } finally {
            renderQueue();
        }
    }

    // ---- Upload semua (sekuensial agar JSON tidak race-condition) ----
    uploadAllBtn.addEventListener('click', async () => {
        const aktaId = detectAktaId();
        if (!aktaId) {
            globalStatus.innerHTML = `<span style="color:#e53935">⚠️ Buka form akta terlebih dahulu!</span>`;
            return;
        }

        uploadAllBtn.disabled = true;
        const targets = uploadQueue.filter(q => q.status === 'pending');
        globalStatus.textContent = `Mengupload 0/${targets.length}...`;

        let done = 0;
        for (const item of targets) {
            const ok = await uploadFile(item);
            if (ok) done++;
            globalStatus.textContent = `Mengupload ${done}/${targets.length}...`;
        }

        globalStatus.innerHTML = `<span style="color:#2e7d32">✅ Selesai: ${done}/${targets.length} berhasil</span>`;
        setTimeout(() => { globalStatus.textContent = ''; }, 5000);
        renderQueue();
    });

    // ---- Bersihkan antrean ----
    clearBtn.addEventListener('click', () => {
        uploadQueue = uploadQueue.filter(q => q.status === 'uploading'); // jaga yang sedang upload
        renderQueue();
        globalStatus.textContent = 'Antrean dibersihkan.';
        setTimeout(() => { globalStatus.textContent = ''; }, 2000);
    });

    // Inject styles (animasi spin + resize handle hover)
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        #ai-resize-handle:hover { color: #666 !important; }
    `;
    document.head.appendChild(style);
}

setTimeout(injectDropzone, 1500);