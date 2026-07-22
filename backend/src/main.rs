use axum::{
    extract::{Multipart, State, Json, DefaultBodyLimit, Path},
    routing::{post, get, delete},
    Router,
};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Arc};
use tokio::{sync::Mutex, process::Command};
use tower_http::cors::{Any, CorsLayer};

struct AppState {
    file_path: PathBuf,
}

#[tokio::main]
async fn main() {
    let file_path = PathBuf::from("dataset_atrbpn.json");
    let shared_state = Arc::new(Mutex::new(AppState { file_path }));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/intercept", post(handle_intercept))
        .route("/api/upload-ocr", post(handle_upload_ocr)) // Endpoint Baru
        .route("/api/dataset", get(get_all_dataset))
        .route("/api/dataset/:akta_id", get(get_one_dataset).put(update_dataset).delete(delete_dataset))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024))   // Izinkan upload file hingga 100MB
        .layer(cors)
        .with_state(shared_state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("🚀 Rust Collector Server berjalan. Menunggu data di port 3000...");
    axum::serve(listener, app).await.unwrap();
}

fn get_val(data: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(val) = data.get(key) {
            if let Some(s) = val.as_str() {
                if !s.trim().is_empty() { return s.trim().to_string(); }
            } else if let Some(n) = val.as_i64() {
                return n.to_string();
            }
        }
    }
    String::new()
}

// URUTAN DI BAWAH INI SEKARANG AKAN TERKUNCI PERMANEN
fn create_base_schema(akta_id: &str, form_id: &str) -> Value {
    json!({
        "akta_id": akta_id,
        "form_source": form_id,
        "input_ocr": {
            "ajb": "",
            "ktp_penjual": [],


            "ktp_pembeli": "",
            "kk_pembeli": "",
            "kode_berkas_cek": "",
            "keabsahan": "",
            "sertifikat": "",
            "pbb": "",
            "bphtb": "",
            "pph": ""
        },
        "output": {
            "no_akta": "",
            "tanggal_akta": "",
            "data_penjual": [],
            "data_pihak_persetujuan": [],
            "data_pembeli": [],
            "sertifikat": {
                "nib": "",
                "nomor_hak_atau_kode_sertif": "",
                "nomer_berkas": ""
            },
            "pbb": {
                "nop": "",
                "tahun": "",
                "luas": "",
                "njop": ""
            },
            "bphtb": {
                "no_bukti_pembayaran": ""
            },
            "pph": {
                "npwp": "",
                "no_suket": ""
            },
            "nilai_akta": "",
            "data_saksi": []
        }
    })
}

async fn handle_intercept(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<Value>,
) -> Json<Value> {
    let form_id = get_val(&payload, &["form_id"]);
    let data = payload.get("data").cloned().unwrap_or(json!({}));
    let current_akta_id = get_val(&data, &["aktaid"]);

    if current_akta_id.is_empty() {
        return Json(json!({ "error": "Form tidak memiliki aktaid" }));
    }

    println!("\n=== RAW DATA DARI FORM {} (Akta ID: {}) ===", form_id, current_akta_id);

    let state_lock = state.lock().await;
    let file_path = &state_lock.file_path;

    let mut current_data: Vec<Value> = vec![];
    if file_path.exists() {
        if let Ok(content) = fs::read_to_string(file_path) {
            if let Ok(parsed) = serde_json::from_str(&content) {
                current_data = parsed;
            }
        }
    }

    // TAHAP 1: Cari entry berdasarkan akta_id (pencocokan utama)
    let entry_idx = current_data.iter().position(|item| {
        item.get("akta_id").and_then(|v| v.as_str()).unwrap_or("") == current_akta_id
    });

    // TAHAP 2: Jika akta_id tidak ditemukan, cari berdasarkan no_akta (anti-duplikat)
    // Web ATRBPN bisa menghasilkan akta_id berbeda untuk akta yang sama di sesi berbeda
    let entry_idx = entry_idx.or_else(|| {
        if form_id == "frmEditAkta" || get_val(&data, &["tipe"]) == "AJB" {
            let incoming_no_akta = get_val(&data, &["nomor"]);
            if !incoming_no_akta.is_empty() {
                return current_data.iter().position(|item| {
                    item.get("output")
                        .and_then(|o| o.get("no_akta"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("") == incoming_no_akta
                });
            }
        }
        None
    });

    let mut entry = if let Some(idx) = entry_idx {
        let existing = current_data.remove(idx);
        // Jika ditemukan via no_akta (bukan akta_id), update akta_id ke yang terbaru
        println!("📝 Menggabungkan data ke entry yang sudah ada (index: {})", idx);
        existing
    } else {
        create_base_schema(&current_akta_id, &form_id)
    };

    // Selalu update akta_id ke yang paling baru dari form
    entry["akta_id"] = json!(current_akta_id);

    entry["form_source"] = json!(form_id);
    let output = entry.get_mut("output").unwrap();

    let nilai_akta = get_val(&data, &["nilaiakta", "nilai_akta"]);
    if !nilai_akta.is_empty() { output["nilai_akta"] = json!(nilai_akta); }

    if form_id == "frmEditAkta" || get_val(&data, &["tipe"]) == "AJB" {
        let no_akta = get_val(&data, &["nomor"]);
        let tgl_akta = get_val(&data, &["tanggal"]);
        if !no_akta.is_empty() { output["no_akta"] = json!(no_akta); }
        if !tgl_akta.is_empty() { output["tanggal_akta"] = json!(tgl_akta); }
    } 
    // ==========================================
    // LOGIKA PIHAK PENJUAL (Pihak 1)
    // ==========================================
    else if form_id == "frmtipepihak1Dukcapil" || form_id == "frmInput1BadanHukum" || form_id == "frmInput1BadanSosial"
        || get_val(&data, &["jenis"]) == "Pihak 1"
        || form_id.contains("Pihak1") || form_id.contains("Input1")
    {
        let mut arr = output["data_penjual"].as_array().cloned().unwrap_or_default();

        // Ambil identifier unik (NIK / NIKR untuk Lembaga Non AHU)
        let nik = get_val(&data, &["NIK", "NIKR"]);
        let no_akta_badan = get_val(&data, &["nomoridentitas"]);
        let nama = get_val(&data, &["NAMA_LENGKAP", "nama"]);

        // Cari apakah entitas ini sudah ada di dalam array
        let idx = arr.iter().position(|p| {
            (!nik.is_empty() && (get_val(p, &["nomor_identitas"]) == nik || get_val(p, &["kode_subyek"]) == nik)) ||
            (!no_akta_badan.is_empty() && get_val(p, &["no_akta_pendirian"]) == no_akta_badan) ||
            (!nama.is_empty() && get_val(p, &["nama"]) == nama)
        });

        let tipe_pemohon = get_val(&data, &["tipepemohon"]);

        // KONDISI A: PERORANGAN (tipepemohon = "1")
        let person_data = if tipe_pemohon == "1" || form_id.contains("Dukcapil") {
            json!({
                "tipe_penjual": "perorangan",
                "jenis_bukti_identitas": get_val(&data, &["tipebuktiid"]),
                "nomor_identitas": nik,
                "nama": nama,
                "alamat": get_val(&data, &["ALAMAT"]),
                "tempat_lahir": get_val(&data, &["TEMPAT_LAHIR"]),
                "tgl_lahir": get_val(&data, &["TANGGAL_LAHIR"]),
                "jenis_kelamin": get_val(&data, &["JENIS_KELAMIN"]),
                "pekerjaan": get_val(&data, &["JENIS_PEKERJAAN"]),
                "npwp": get_val(&data, &["npwp"])
            })
        }
        // KONDISI B: BADAN HUKUM (tipepemohon = "3")
        else if tipe_pemohon == "3" || form_id.contains("BadanHukum") {
            json!({
                "tipe_penjual": "badan hukum",
                "jenis_badan": get_val(&data, &["tipepemilikid"]),
                "tipe_usaha": get_val(&data, &["tipeusaha"]),
                "nama": nama,
                "alamat": get_val(&data, &["alamat", "ALAMAT"]),
                "kota": get_val(&data, &["kota", "NAMA_KABUPATEN"]),
                "npwp": get_val(&data, &["npwp"]),
                "no_akta_pendirian": no_akta_badan,
                "tgl_akta_pendirian": get_val(&data, &["TANGGAL_PENDIRIAN"]),
                "email": get_val(&data, &["email"])
            })
        }
        // KONDISI C: LEMBAGA NON AHU / BADAN SOSIAL (tipepemohon = "36")
        else if tipe_pemohon == "36" || form_id.contains("BadanSosial") {
            json!({
                "tipe_penjual": "lembaga non ahu",
                "kode_subyek": nik,
                "nama": nama,
                "alamat": get_val(&data, &["ALAMAT"]),
                "kota": get_val(&data, &["kota", "NAMA_KABUPATEN"]),
                "npwp": get_val(&data, &["npwp"]),
                "nomor_telepon": get_val(&data, &["nomortelepon"]),
                "email": get_val(&data, &["email"])
            })
        }
        // FALLBACK: simpan data mentah agar tidak hilang
        else {
            json!({
                "tipe_penjual": format!("unknown (tipepemohon={})", tipe_pemohon),
                "nama": nama,
                "nomor_identitas": nik
            })
        };

        if let Some(i) = idx { arr[i] = person_data; } else { arr.push(person_data); }
        output["data_penjual"] = Value::Array(arr);
    }
    else if form_id == "frmPihaksetujuDukcapil" || get_val(&data, &["jenis"]) == "WNI" || get_val(&data, &["jenis"]) == "WNA" {
        let mut arr = output["data_pihak_persetujuan"].as_array().cloned().unwrap_or_default();
        let nik = get_val(&data, &["NIK"]);
        let nama = get_val(&data, &["NAMA_LENGKAP"]);
        
        let idx = arr.iter().position(|p| {
            (!nik.is_empty() && get_val(p, &["nik"]) == nik) || (!nama.is_empty() && get_val(p, &["nama"]) == nama)
        });

        let person_data = json!({
            "nik": nik, "nama": nama, "alamat": get_val(&data, &["ALAMAT"]), 
            "tempat_lahir": get_val(&data, &["TEMPAT_LAHIR"]), "tgl_lahir": get_val(&data, &["TANGGAL_LAHIR"]),
            "jenis_kelamin": get_val(&data, &["JENIS_KELAMIN"]), "pekerjaan": get_val(&data, &["JENIS_PEKERJAAN"])
        });

        if let Some(i) = idx { arr[i] = person_data; } else { arr.push(person_data); }
        output["data_pihak_persetujuan"] = Value::Array(arr);
    }
    // ==========================================
    // LOGIKA PIHAK PEMBELI (Pihak 2)
    // ==========================================
    else if form_id == "frmtipepihak2Dukcapil" || form_id == "frmInput2BadanHukum" || form_id == "frmInput2BadanSosial"
        || get_val(&data, &["jenis"]) == "Pihak 2"
        || form_id.contains("Pihak2") || form_id.contains("Input2")
    {
        let mut arr = output["data_pembeli"].as_array().cloned().unwrap_or_default();

        let nik = get_val(&data, &["NIK", "NIKR"]);
        let no_akta_badan = get_val(&data, &["nomoridentitas"]);
        let nama = get_val(&data, &["NAMA_LENGKAP", "nama"]);

        let idx = arr.iter().position(|p| {
            (!nik.is_empty() && (get_val(p, &["nomor_identitas"]) == nik || get_val(p, &["kode_subyek"]) == nik)) ||
            (!no_akta_badan.is_empty() && get_val(p, &["no_akta_pendirian"]) == no_akta_badan) ||
            (!nama.is_empty() && get_val(p, &["nama"]) == nama)
        });

        let tipe_pemohon = get_val(&data, &["tipepemohon"]);

        // KONDISI A: PERORANGAN
        let person_data = if tipe_pemohon == "1" || form_id.contains("Dukcapil") {
            json!({
                "tipe_pembeli": "perorangan",
                "jenis_bukti_identitas": get_val(&data, &["tipebuktiid"]),
                "nomor_identitas": nik,
                "nama": nama,
                "alamat": get_val(&data, &["ALAMAT"]),
                "tempat_lahir": get_val(&data, &["TEMPAT_LAHIR"]),
                "tgl_lahir": get_val(&data, &["TANGGAL_LAHIR"]),
                "jenis_kelamin": get_val(&data, &["JENIS_KELAMIN"]),
                "pekerjaan": get_val(&data, &["JENIS_PEKERJAAN"]),
                "npwp": get_val(&data, &["npwp"])
            })
        }
        // KONDISI B: BADAN HUKUM
        else if tipe_pemohon == "3" || form_id.contains("BadanHukum") {
            json!({
                "tipe_pembeli": "badan hukum",
                "jenis_badan": get_val(&data, &["tipepemilikid"]),
                "tipe_usaha": get_val(&data, &["tipeusaha"]),
                "nama": nama,
                "alamat": get_val(&data, &["alamat", "ALAMAT"]),
                "kota": get_val(&data, &["kota", "NAMA_KABUPATEN"]),
                "npwp": get_val(&data, &["npwp"]),
                "no_akta_pendirian": no_akta_badan,
                "tgl_akta_pendirian": get_val(&data, &["TANGGAL_PENDIRIAN"]),
                "email": get_val(&data, &["email"])
            })
        }
        // KONDISI C: LEMBAGA NON AHU / BADAN SOSIAL
        else if tipe_pemohon == "36" || form_id.contains("BadanSosial") {
            json!({
                "tipe_pembeli": "lembaga non ahu",
                "kode_subyek": nik,
                "nama": nama,
                "alamat": get_val(&data, &["ALAMAT"]),
                "kota": get_val(&data, &["kota", "NAMA_KABUPATEN"]),
                "npwp": get_val(&data, &["npwp"]),
                "nomor_telepon": get_val(&data, &["nomortelepon"]),
                "email": get_val(&data, &["email"])
            })
        }
        // FALLBACK
        else {
            json!({
                "tipe_pembeli": format!("unknown (tipepemohon={})", tipe_pemohon),
                "nama": nama,
                "nomor_identitas": nik
            })
        };

        if let Some(i) = idx { arr[i] = person_data; } else { arr.push(person_data); }
        output["data_pembeli"] = Value::Array(arr);
    }
    else if form_id == "frmSaksiDukcapil" || get_val(&data, &["jenis"]) == "Saksi" {
        let mut arr = output["data_saksi"].as_array().cloned().unwrap_or_default();
        let nik = get_val(&data, &["NIK"]);
        let nama = get_val(&data, &["NAMA_LENGKAP", "nama"]);
        
        let idx = arr.iter().position(|p| {
            (!nik.is_empty() && get_val(p, &["nik"]) == nik) || (!nama.is_empty() && get_val(p, &["nama"]) == nama)
        });

        let person_data = json!({
            "nik": nik, "nama": nama, "alamat": get_val(&data, &["ALAMAT"]),
            "tempat_lahir": get_val(&data, &["TEMPAT_LAHIR"]), "tgl_lahir": get_val(&data, &["TANGGAL_LAHIR"]),
            "jenis_kelamin": get_val(&data, &["JENIS_KELAMIN"]), "pekerjaan": get_val(&data, &["JENIS_PEKERJAAN"])
        });

        if let Some(i) = idx { arr[i] = person_data; } else { arr.push(person_data); }
        output["data_saksi"] = Value::Array(arr);
    }
    else if form_id == "frmHAT" || get_val(&data, &["jenisdokumen"]) == "AJB" {
        let mut nib = get_val(&data, &["nibelektronik"]);
        if nib.is_empty() { nib = get_val(&data, &["nib"]); }
        if nib.is_empty() { nib = get_val(&output["sertifikat"], &["nib"]); }

        let mut sertif = get_val(&data, &["kodesertipikat"]);
        if sertif.is_empty() { sertif = get_val(&data, &["nomorhak"]); }
        if sertif.is_empty() { sertif = get_val(&output["sertifikat"], &["nomor_hak_atau_kode_sertif"]); }

        let mut nomer_berkas = get_val(&data, &["nomorberkas", "nomerberkas", "nomor_berkas", "nomer_berkas"]);
        if nomer_berkas.is_empty() { nomer_berkas = get_val(&output["sertifikat"], &["nomer_berkas"]); }

        output["sertifikat"] = json!({
            "nib": nib,
            "nomor_hak_atau_kode_sertif": sertif,
            "nomer_berkas": nomer_berkas
        });
    }
    else if form_id == "frmPBBDetail" || get_val(&data, &["tipedokumen"]) == "PBB" {
        let n_nop = get_val(&data, &["nomor"]);
        let n_thn = get_val(&data, &["tahun"]);
        let n_luas = get_val(&data, &["luas"]);
        let n_nilai = get_val(&data, &["nilai"]);

        output["pbb"] = json!({
            "nop": if !n_nop.is_empty() { n_nop } else { get_val(&output["pbb"], &["nop"]) },
            "tahun": if !n_thn.is_empty() { n_thn } else { get_val(&output["pbb"], &["tahun"]) },
            "luas": if !n_luas.is_empty() { n_luas } else { get_val(&output["pbb"], &["luas"]) },
            "njop": if !n_nilai.is_empty() { n_nilai } else { get_val(&output["pbb"], &["njop"]) }
        });
    }
    else if form_id == "frmBPHTB" || data.get("statusbphtb").is_some() {
        let n_bukti = get_val(&data, &["nomorbphtb"]);
        output["bphtb"] = json!({
            "no_bukti_pembayaran": if !n_bukti.is_empty() { n_bukti } else { get_val(&output["bphtb"], &["no_bukti_pembayaran"]) }
        });
    }
    else if form_id == "frmSurat" || get_val(&data, &["tipedokumen"]) == "SSP" {
        let n_npwp = get_val(&data, &["npwp"]);
        let n_suket = get_val(&data, &["kodeverifikasi"]);
        output["pph"] = json!({
            "npwp": if !n_npwp.is_empty() { n_npwp } else { get_val(&output["pph"], &["npwp"]) },
            "no_suket": if !n_suket.is_empty() { n_suket } else { get_val(&output["pph"], &["no_suket"]) }
        });
    }

    current_data.push(entry);

    if let Ok(json_str) = serde_json::to_string_pretty(&current_data) {
        if fs::write(file_path, json_str).is_ok() {
            println!("[Disimpan] ID Dokumen: {} | Dari: {}", current_akta_id, form_id);
            return Json(json!({ "status": "success" }));
        }
    }

    Json(json!({ "error": "Gagal menyimpan file" }))
}

// ==========================================
// HANDLER BARU: Upload File → OCR → Update JSON
// ==========================================
async fn handle_upload_ocr(
    State(state): State<Arc<Mutex<AppState>>>,
    mut multipart: Multipart,
) -> Json<Value> {
    let mut akta_id = String::new();
    let mut doc_type = String::new();
    let mut file_bytes: Vec<u8> = Vec::new();
    let mut original_filename = String::from("upload.png");

    // 1. Parsing Form Data (File & Metadata)
    loop {
        match multipart.next_field().await {
            Ok(Some(field)) => {
                let name = field.name().unwrap_or("").to_string();
                match name.as_str() {
                    "akta_id"  => akta_id = field.text().await.unwrap_or_default(),
                    "doc_type" => doc_type = field.text().await.unwrap_or_default(),
                    "file" => {
                        // Simpan nama file asli untuk menentukan ekstensi
                        if let Some(fname) = field.file_name() {
                            original_filename = fname.to_string();
                        }
                        file_bytes = field.bytes().await.unwrap_or_default().to_vec();
                    }
                    _ => {}
                }
            }
            Ok(None) => break,
            Err(e) => {
                println!("❌ Gagal membaca multipart field: {}", e);
                break;
            }
        }
    }

    if akta_id.is_empty() || file_bytes.is_empty() || doc_type.is_empty() {
        println!("❌ Upload gagal: Data tidak lengkap (akta_id={}, doc_type={}, file_size={}).", akta_id, doc_type, file_bytes.len());
        return Json(json!({ "error": "Data tidak lengkap: akta_id, doc_type, dan file wajib diisi." }));
    }

    // Tentukan ekstensi file (pertahankan ekstensi asli agar Tesseract bisa mendeteksi format)
    let ext = std::path::Path::new(&original_filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    println!("📥 Menerima file '{}' ({}) untuk Akta ID: {}... Memproses OCR ⚙️", doc_type, ext, akta_id);

    // 2. Simpan file sementara
    let temp_prefix = format!("temp_ocr_{}_{}", akta_id, doc_type);
    let temp_filename = format!("{}.{}", temp_prefix, ext);
    if let Err(e) = fs::write(&temp_filename, &file_bytes) {
        println!("❌ Gagal menyimpan file sementara: {}", e);
        return Json(json!({ "error": "Gagal menyimpan file sementara." }));
    }

    // 3. Jika PDF, konversi ke PNG dulu menggunakan pdftoppm (Poppler)
    let is_pdf = ext == "pdf";
    let mut page_files: Vec<String> = Vec::new();

    if is_pdf {
        println!("📄 File PDF terdeteksi, mengonversi ke PNG...");
        let convert_result = Command::new("pdftoppm")
            .arg("-png")
            .arg("-r").arg("300") // 300 DPI untuk kualitas OCR yang baik
            .arg(&temp_filename)
            .arg(&temp_prefix) // output: temp_prefix-1.png, temp_prefix-2.png, ...
            .output()
            .await;

        // Hapus file PDF asli (tidak diperlukan lagi)
        let _ = fs::remove_file(&temp_filename);

        match convert_result {
            Ok(output) if output.status.success() => {
                // Kumpulkan semua file PNG hasil konversi, urutkan berdasarkan nama
                if let Ok(entries) = fs::read_dir(".") {
                    let mut files: Vec<String> = entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .filter(|name| name.starts_with(&temp_prefix) && name.ends_with(".png"))
                        .collect();
                    files.sort();
                    page_files = files;
                }

                if page_files.is_empty() {
                    println!("❌ pdftoppm tidak menghasilkan file PNG.");
                    return Json(json!({ "error": "Konversi PDF gagal: tidak ada halaman yang dihasilkan." }));
                }

                println!("✅ PDF dikonversi menjadi {} halaman PNG.", page_files.len());
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                println!("❌ pdftoppm gagal: {}", stderr);
                return Json(json!({ "error": format!("Konversi PDF gagal: {}. Install via `brew install poppler`.", stderr.trim()) }));
            }
            Err(e) => {
                println!("❌ pdftoppm tidak ditemukan: {}", e);
                return Json(json!({ "error": format!("pdftoppm tidak ditemukan: {}. Install via `brew install poppler`.", e) }));
            }
        }
    } else {
        // Bukan PDF → langsung pakai file asli
        page_files.push(temp_filename.clone());
    }



    // 4. Jalankan OCR pada setiap halaman: Pre-process → Tesseract
    let mut all_ocr_text = Vec::new();

    for (i, page_file) in page_files.iter().enumerate() {
        // ── 4a-1. Deteksi Orientasi & Auto-Rotate via Tesseract OSD ──
        let mut rotated_file = page_file.clone();
        let osd_result = Command::new("tesseract")
            .arg(page_file)
            .arg("stdout")
            .arg("--psm").arg("0")
            .output()
            .await;

        if let Ok(output) = osd_result {
            if output.status.success() {
                let osd_out = String::from_utf8_lossy(&output.stdout);
                let mut rotate_angle = None;
                for line in osd_out.lines() {
                    if line.starts_with("Rotate:") || line.starts_with("Rotate: ") {
                        if let Some(angle_str) = line.split(':').nth(1) {
                            if let Ok(angle) = angle_str.trim().parse::<i32>() {
                                if angle != 0 {
                                    rotate_angle = Some(angle);
                                }
                            }
                        }
                    }
                }

                if let Some(angle) = rotate_angle {
                    println!("🔄 Halaman {} terdeteksi miring/terputar. Melakukan rotasi {} derajat...", i + 1, angle);
                    let temp_rotated = format!("{}_rotated.png", page_file.trim_end_matches(".png").trim_end_matches(".jpg").trim_end_matches(".jpeg").trim_end_matches(".webp"));
                    let rotate_result = Command::new("magick")
                        .arg(page_file)
                        .arg("-rotate").arg(angle.to_string())
                        .arg(&temp_rotated)
                        .output()
                        .await;

                    if let Ok(r_out) = rotate_result {
                        if r_out.status.success() {
                            rotated_file = temp_rotated;
                        }
                    }
                }
            }
        }

        // ── 4a-2. Pre-Processing via ImageMagick ──
        let clean_file = format!("{}_clean.png", page_file.trim_end_matches(".png").trim_end_matches(".jpg").trim_end_matches(".jpeg").trim_end_matches(".webp"));
        let preprocess_result = Command::new("magick")
            .arg(&rotated_file)
            .arg("-colorspace").arg("gray")         // Ubah ke hitam-putih
            .arg("-auto-level")                     // Perbaiki kontras secara otomatis
            .arg("-enhance")                        // Kurangi noise bintik-bintik (despeckle)
            .arg("-sharpen").arg("0x1.5")           // Pertajam tepi huruf agar mudah dibaca Tesseract
            .arg("-deskew").arg("40%")              // Luruskan gambar yang miring
            .arg(&clean_file)
            .output()
            .await;

        // Tentukan file mana yang akan di-OCR
        let ocr_input = match preprocess_result {
            Ok(output) if output.status.success() => {
                println!("🧹 Halaman {} di-preprocess berhasil.", i + 1);
                clean_file.clone()
            }
            _ => {
                println!("⚠️  ImageMagick gagal pada halaman {}, OCR langsung tanpa preprocess.", i + 1);
                rotated_file.clone()
            }
        };

        // ── 4b. Tesseract dengan parameter optimal ──
        let tesseract_result = Command::new("tesseract")
            .arg(&ocr_input)
            .arg("stdout")
            .arg("-l").arg("ind+eng")              // Gunakan kamus Indonesia + Inggris untuk NIK & Nama
            .arg("--oem").arg("1")                    // Mode Neural Network (LSTM)
            .arg("--psm").arg("3")                    // Deteksi layout halaman otomatis
            .output()
            .await;

        // Bersihkan file sementara
        let _ = fs::remove_file(page_file);
        let _ = fs::remove_file(&clean_file);
        if rotated_file != *page_file {
            let _ = fs::remove_file(&rotated_file);
        }

        match tesseract_result {
            Ok(output) if output.status.success() => {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    all_ocr_text.push(text);
                }
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                println!("⚠️  Tesseract error pada halaman {} dari '{}': {}", i + 1, doc_type, stderr.trim());
            }
            Err(e) => {
                // Bersihkan sisa file halaman
                for remaining in page_files.iter().skip(i + 1) {
                    let _ = fs::remove_file(remaining);
                    let clean = format!("{}_clean.png", remaining.trim_end_matches(".png"));
                    let _ = fs::remove_file(&clean);
                }
                println!("❌ Gagal menjalankan Tesseract: {}", e);
                return Json(json!({ "error": format!("Tesseract tidak ditemukan: {}. Install via `brew install tesseract`.", e) }));
            }
        }
    }

    let ocr_text = all_ocr_text.join("\n\n--- halaman ---\n\n");

    if ocr_text.is_empty() {
        println!("⚠️  OCR tidak menghasilkan teks untuk '{}' (Akta: {})", doc_type, akta_id);
    } else {
        println!("✅ OCR Selesai untuk '{}' (Akta: {}). {} karakter dari {} halaman.", doc_type, akta_id, ocr_text.len(), all_ocr_text.len());
    }

    // 4. Update file JSON secara aman (lock mutex agar thread-safe)
    let state_lock = state.lock().await;
    let file_path = &state_lock.file_path;

    let mut current_data: Vec<Value> = vec![];
    if file_path.exists() {
        if let Ok(content) = fs::read_to_string(file_path) {
            if let Ok(parsed) = serde_json::from_str(&content) {
                current_data = parsed;
            }
        }
    }

    let entry_idx = current_data.iter().position(|item| {
        item.get("akta_id").and_then(|v| v.as_str()).unwrap_or("") == akta_id
    });

    let mut entry = if let Some(idx) = entry_idx {
        current_data.remove(idx)
    } else {
        // Buat entry baru jika belum ada (bisa terjadi jika OCR dilakukan sebelum intercept)
        println!("ℹ️  Entry untuk Akta ID '{}' belum ada, membuat skema baru.", akta_id);
        create_base_schema(&akta_id, "ocr_upload")
    };

    // 5. Masukkan teks OCR ke field yang tepat di dalam "input_ocr"
    //    Untuk field array (ktp_persetujuan, ktp_saksi), append sebagai elemen baru.
    if let Some(input_ocr) = entry.get_mut("input_ocr") {
        match doc_type.as_str() {
            "ktp_penjual" => {
                // Field ini adalah array, tambahkan entri baru
                if let Some(arr) = input_ocr[&doc_type].as_array_mut() {
                    arr.push(json!(ocr_text));
                }
            }
            _ => {
                // Field biasa: langsung replace
                input_ocr[&doc_type] = json!(ocr_text);
            }
        }
    }

    current_data.push(entry);

    // 6. Simpan kembali ke JSON
    match serde_json::to_string_pretty(&current_data) {
        Ok(json_str) => {
            if fs::write(file_path, json_str).is_ok() {
                println!("💾 Teks OCR '{}' berhasil disuntikkan ke JSON untuk Akta ID: {}", doc_type, akta_id);
                Json(json!({ "status": "success", "doc_type": doc_type, "akta_id": akta_id, "chars_extracted": ocr_text.len() }))
            } else {
                    return Json(json!({ "error": "Gagal menyimpan file JSON." }))
            }
        }
        Err(e) => Json(json!({ "error": format!("Gagal serialisasi JSON: {}", e) }))
    }
}

// ==========================================
// HANDLERS UNTUK REST API
// ==========================================

async fn get_all_dataset(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Json<Value> {
    let state_lock = state.lock().await;
    let file_path = &state_lock.file_path;

    if file_path.exists() {
        if let Ok(content) = fs::read_to_string(file_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<Value>>(&content) {
                return Json(json!(parsed));
            }
        }
    }
    
    Json(json!([]))
}

async fn get_one_dataset(
    State(state): State<Arc<Mutex<AppState>>>,
    Path(akta_id): Path<String>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let state_lock = state.lock().await;
    let file_path = &state_lock.file_path;

    if file_path.exists() {
        if let Ok(content) = fs::read_to_string(file_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<Value>>(&content) {
                if let Some(entry) = parsed.into_iter().find(|item| item.get("akta_id").and_then(|v| v.as_str()).unwrap_or("") == akta_id) {
                    return Ok(Json(entry));
                }
            }
        }
    }
    
    Err((axum::http::StatusCode::NOT_FOUND, Json(json!({ "error": "Dataset not found" }))))
}

async fn update_dataset(
    State(state): State<Arc<Mutex<AppState>>>,
    Path(akta_id): Path<String>,
    Json(mut payload): Json<Value>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let state_lock = state.lock().await;
    let file_path = &state_lock.file_path;

    let mut current_data: Vec<Value> = vec![];
    if file_path.exists() {
        if let Ok(content) = fs::read_to_string(file_path) {
            if let Ok(parsed) = serde_json::from_str(&content) {
                current_data = parsed;
            }
        }
    }

    if let Some(idx) = current_data.iter().position(|item| item.get("akta_id").and_then(|v| v.as_str()).unwrap_or("") == akta_id) {
        payload["akta_id"] = json!(akta_id);
        current_data[idx] = payload.clone();
        
        if let Ok(json_str) = serde_json::to_string_pretty(&current_data) {
            if fs::write(file_path, json_str).is_ok() {
                return Ok(Json(payload));
            }
        }
        return Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Failed to write file" }))));
    }
    
    Err((axum::http::StatusCode::NOT_FOUND, Json(json!({ "error": "Dataset not found" }))))
}

async fn delete_dataset(
    State(state): State<Arc<Mutex<AppState>>>,
    Path(akta_id): Path<String>,
) -> Result<Json<Value>, (axum::http::StatusCode, Json<Value>)> {
    let state_lock = state.lock().await;
    let file_path = &state_lock.file_path;

    let mut current_data: Vec<Value> = vec![];
    if file_path.exists() {
        if let Ok(content) = fs::read_to_string(file_path) {
            if let Ok(parsed) = serde_json::from_str(&content) {
                current_data = parsed;
            }
        }
    }

    let initial_len = current_data.len();
    current_data.retain(|item| item.get("akta_id").and_then(|v| v.as_str()).unwrap_or("") != akta_id);

    if current_data.len() < initial_len {
        if let Ok(json_str) = serde_json::to_string_pretty(&current_data) {
            if fs::write(file_path, json_str).is_ok() {
                return Ok(Json(json!({ "message": "Dataset deleted successfully" })));
            }
        }
        return Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Failed to write file" }))));
    }

    Err((axum::http::StatusCode::NOT_FOUND, Json(json!({ "error": "Dataset not found" }))))
}