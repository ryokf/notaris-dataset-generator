use axum::{
    extract::{State, Json},
    routing::post,
    Router,
};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Arc};
use tokio::sync::Mutex;
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
            "npwp_penjual": "",
            "akta_pendirian_penjual": "",
            "ktp_persetujuan": [],
            "ktp_pembeli": "",
            "kk_pembeli": "",
            "kode_berkas_cek": "",
            "sertifikat": "",
            "pbb": "",
            "bphtb": "",
            "pph": "",
            "ktp_saksi": []
        },
        "output": {
            "no_akta": "",
            "tanggal_akta": "",
            "data_penjual": [],
            "data_pihak_persetujuan": [],
            "data_pembeli": [],
            "sertifikat": {
                "nib": "",
                "nomor_hak_atau_kode_sertif": ""
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

    let entry_idx = current_data.iter().position(|item| {
        item.get("akta_id").and_then(|v| v.as_str()).unwrap_or("") == current_akta_id
    });

    let mut entry = if let Some(idx) = entry_idx {
        current_data.remove(idx)
    } else {
        create_base_schema(&current_akta_id, &form_id)
    };

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
    else if form_id == "frmtipepihak1Dukcapil" || form_id == "frmInput1BadanHukum" || get_val(&data, &["jenis"]) == "Pihak 1" {
        let mut arr = output["data_penjual"].as_array().cloned().unwrap_or_default();
        let nik = get_val(&data, &["NIK"]);
        let no_akta_badan = get_val(&data, &["nomoridentitas"]);
        let nama = get_val(&data, &["NAMA_LENGKAP", "nama"]);
        
        let idx = arr.iter().position(|p| {
            (!nik.is_empty() && get_val(p, &["nomor_identitas"]) == nik) || 
            (!no_akta_badan.is_empty() && get_val(p, &["no_akta_pendirian"]) == no_akta_badan) || 
            (!nama.is_empty() && get_val(p, &["nama"]) == nama)
        });

        let tipe_pemohon = get_val(&data, &["tipepemohon"]);
        let person_data = if tipe_pemohon != "1" {
            json!({
                "tipe_penjual": "badan hukum",
                "jenis": get_val(&data, &["tipepemilikid"]), "tipe": get_val(&data, &["tipeusaha"]), "nama": nama,
                "alamat": get_val(&data, &["alamat", "ALAMAT"]), "kota": get_val(&data, &["kota", "NAMA_KABUPATEN"]),
                "npwp": get_val(&data, &["npwp"]), "no_akta_pendirian": no_akta_badan, "tgl_akta_pendirian": get_val(&data, &["TANGGAL_PENDIRIAN"])
            })
        } else {
            json!({
                "tipe_penjual": "perorangan",
                "jenis_bukti_identitas": get_val(&data, &["tipebuktiid"]), "nomor_identitas": nik, "nama": nama,
                "alamat": get_val(&data, &["ALAMAT"]), "tempat_lahir": get_val(&data, &["TEMPAT_LAHIR"]),
                "tgl_lahir": get_val(&data, &["TANGGAL_LAHIR"]), "jenis_kelamin": get_val(&data, &["JENIS_KELAMIN"]), "pekerjaan": get_val(&data, &["JENIS_PEKERJAAN"])
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
    else if form_id == "frmtipepihak2Dukcapil" || form_id == "frmInput2BadanHukum" || get_val(&data, &["jenis"]) == "Pihak 2" {
        let mut arr = output["data_pembeli"].as_array().cloned().unwrap_or_default();
        let nik = get_val(&data, &["NIK"]);
        let no_akta_badan = get_val(&data, &["nomoridentitas"]);
        let nama = get_val(&data, &["NAMA_LENGKAP", "nama"]);
        
        let idx = arr.iter().position(|p| {
            (!nik.is_empty() && get_val(p, &["nomor_identitas"]) == nik) || 
            (!no_akta_badan.is_empty() && get_val(p, &["no_akta_pendirian"]) == no_akta_badan) || 
            (!nama.is_empty() && get_val(p, &["nama"]) == nama)
        });

        let tipe_pemohon = get_val(&data, &["tipepemohon"]);
        let person_data = if tipe_pemohon != "1" {
            json!({
                "tipe_pembeli": "badan hukum",
                "jenis": get_val(&data, &["tipepemilikid"]), "tipe": get_val(&data, &["tipeusaha"]), "nama": nama, 
                "alamat": get_val(&data, &["alamat", "ALAMAT"]), "kota": get_val(&data, &["kota", "NAMA_KABUPATEN"]), 
                "npwp": get_val(&data, &["npwp"]), "no_akta_pendirian": no_akta_badan, "tgl_akta_pendirian": get_val(&data, &["TANGGAL_PENDIRIAN"])
            })
        } else {
            json!({
                "tipe_pembeli": "perorangan",
                "jenis_bukti_identitas": get_val(&data, &["tipebuktiid"]), "nomor_identitas": nik,
                "nama": nama, "alamat": get_val(&data, &["ALAMAT"]), "tempat_lahir": get_val(&data, &["TEMPAT_LAHIR"]),
                "tgl_lahir": get_val(&data, &["TANGGAL_LAHIR"]), "jenis_kelamin": get_val(&data, &["JENIS_KELAMIN"]), "pekerjaan": get_val(&data, &["JENIS_PEKERJAAN"])
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

        output["sertifikat"] = json!({ "nib": nib, "nomor_hak_atau_kode_sertif": sertif });
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