const API_BASE = 'http://localhost:3000/api';

export interface AktaEntry {
  akta_id: string;
  form_source: string;
  input_ocr: {
    ajb: string;
    ktp_penjual: string[];
    ktp_pembeli: string;
    kk_pembeli: string;
    kode_berkas_cek: string;
    keabsahan: string;
    sertifikat: string;
    pbb: string;
    bphtb: string;
    pph: string;
  };
  output: {
    no_akta: string;
    tanggal_akta: string;
    data_penjual: any[];
    data_pihak_persetujuan: any[];
    data_pembeli: any[];
    sertifikat: { nib: string; nomor_hak_atau_kode_sertif: string; nomer_berkas: string };
    pbb: { nop: string; tahun: string; luas: string; njop: string };
    bphtb: { no_bukti_pembayaran: string };
    pph: { npwp: string; no_suket: string };
    nilai_akta: string;
    data_saksi: any[];
  };
}

export async function getAllDataset(): Promise<AktaEntry[]> {
  const response = await fetch(`${API_BASE}/dataset`);
  if (!response.ok) {
    throw new Error(`Failed to fetch datasets: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getOneDataset(aktaId: string): Promise<AktaEntry> {
  const response = await fetch(`${API_BASE}/dataset/${aktaId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset ${aktaId}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function updateDataset(aktaId: string, data: AktaEntry): Promise<AktaEntry> {
  const response = await fetch(`${API_BASE}/dataset/${aktaId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Failed to update dataset ${aktaId}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function deleteDataset(aktaId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/dataset/${aktaId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete dataset ${aktaId}: ${response.status} ${response.statusText}`);
  }
}
