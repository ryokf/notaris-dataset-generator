'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AktaEntry, getOneDataset, updateDataset } from '@/lib/api';
import styles from './page.module.css';

export default function AktaDetail() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<AktaEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Local state for edits
  const [editForm, setEditForm] = useState<Partial<AktaEntry['output']>>({});
  const [toastVisible, setToastVisible] = useState(false);
  const [expandedOcr, setExpandedOcr] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchAkta() {
      try {
        const result = await getOneDataset(id);
        setData(result);
        setEditForm(result.output || {});
      } catch (err: any) {
        setError(err.message || 'Failed to fetch akta');
      } finally {
        setLoading(false);
      }
    }
    if (id) {
      fetchAkta();
    }
  }, [id]);

  const handleSave = async () => {
    if (!data) return;
    try {
      const updatedData = { ...data, output: { ...data.output, ...editForm } };
      await updateDataset(id, updatedData);
      setData(updatedData);
      setIsEditing(false);
      showToast();
    } catch (err) {
      console.error('Failed to update', err);
      alert('Gagal menyimpan perubahan');
    }
  };

  const showToast = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  const handleChange = (fieldPath: string, value: any) => {
    setEditForm((prev) => {
      const newForm = { ...prev };
      const parts = fieldPath.split('.');
      let current: any = newForm;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newForm;
    });
  };

  const toggleOcr = (key: string) => {
    setExpandedOcr(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Memuat Data Akta...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.errorContainer}>
        <h2>Data Tidak Ditemukan</h2>
        <p>{error}</p>
        <Link href="/" className={styles.backButton} style={{marginTop: '1rem'}}>
          &larr; Kembali ke Beranda
        </Link>
      </div>
    );
  }

  const { input_ocr, output, form_source, akta_id } = data;

  const renderField = (label: string, value: any, fieldPath?: string) => (
    <div className={styles.fieldGroup}>
      <span className={styles.label}>{label}</span>
      {isEditing && fieldPath ? (
        <input
          type="text"
          className={`${styles.input} ${styles.inputGlow}`}
          value={
            fieldPath.includes('.') 
              ? fieldPath.split('.').reduce((acc: any, curr) => acc?.[curr], editForm) || ''
              : (editForm as any)[fieldPath] || ''
          }
          onChange={(e) => handleChange(fieldPath, e.target.value)}
        />
      ) : (
        <div className={styles.value}>{value || '-'}</div>
      )}
    </div>
  );

  const getBadgeClass = (tipe: string) => {
    if (tipe?.toLowerCase().includes('perorangan')) return styles.badgePerorangan;
    if (tipe?.toLowerCase().includes('badan hukum')) return styles.badgeBadanHukum;
    return styles.badgeLembaga;
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Link href="/" className={styles.backButton}>
          &larr; Kembali
        </Link>
        <div className={styles.headerInfo}>
          <h1 className={styles.headerTitle}>No Akta: {output?.no_akta || '-'}</h1>
          <p className={styles.headerSubtitle}>Tanggal Akta: {output?.tanggal_akta || '-'}</p>
        </div>
        <div>
          {isEditing ? (
            <button className={styles.saveButton} onClick={handleSave}>
              💾 Simpan
            </button>
          ) : (
            <button className={styles.editButton} onClick={() => setIsEditing(true)}>
              ✏️ Edit
            </button>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {/* Info Akta */}
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Info Akta</h2>
          <div className={styles.grid2}>
            {renderField('Nomor Akta', output?.no_akta, 'no_akta')}
            {renderField('Tanggal Akta', output?.tanggal_akta, 'tanggal_akta')}
            {renderField('Nilai Akta', output?.nilai_akta, 'nilai_akta')}
            <div className={styles.fieldGroup}>
              <span className={styles.label}>Form Source</span>
              <div className={`${styles.value} ${styles.readonlyText}`}>{form_source || '-'}</div>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.label}>Akta ID</span>
              <div className={`${styles.value} ${styles.readonlyText}`}>{akta_id || id}</div>
            </div>
          </div>
        </section>

        {/* Data Penjual */}
        {output?.data_penjual && output.data_penjual.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Data Penjual</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Tipe</th>
                    <th className={styles.th}>Nama</th>
                    <th className={styles.th}>Identitas / NPWP</th>
                    <th className={styles.th}>Alamat</th>
                    <th className={styles.th}>Detail Lain</th>
                  </tr>
                </thead>
                <tbody>
                  {output.data_penjual.map((p, idx) => (
                    <tr key={idx} className={styles.tr}>
                      <td className={styles.td}>
                        <span className={`${styles.badge} ${getBadgeClass(p.tipe_penjual || '')}`}>
                          {p.tipe_penjual || 'Unknown'}
                        </span>
                      </td>
                      <td className={styles.td}>{p.nama || '-'}</td>
                      <td className={styles.td}>{p.nomor_identitas || p.npwp || '-'}</td>
                      <td className={styles.td}>{p.alamat || '-'}</td>
                      <td className={styles.td}>
                        {p.tipe_penjual === 'perorangan' ? (
                          <>
                            {p.tempat_lahir && p.tgl_lahir && <div>Lahir: {p.tempat_lahir}, {p.tgl_lahir}</div>}
                            {p.jenis_kelamin && <div>JK: {p.jenis_kelamin}</div>}
                            {p.pekerjaan && <div>Kerja: {p.pekerjaan}</div>}
                          </>
                        ) : (
                          <>
                            {p.jenis_badan && <div>Jenis: {p.jenis_badan}</div>}
                            {p.tipe_usaha && <div>Usaha: {p.tipe_usaha}</div>}
                            {p.kota && <div>Kota: {p.kota}</div>}
                            {p.no_akta_pendirian && <div>Akta Pendirian: {p.no_akta_pendirian}</div>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Data Pembeli */}
        {output?.data_pembeli && output.data_pembeli.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Data Pembeli</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Tipe</th>
                    <th className={styles.th}>Nama</th>
                    <th className={styles.th}>Identitas / NPWP</th>
                    <th className={styles.th}>Alamat</th>
                    <th className={styles.th}>Detail Lain</th>
                  </tr>
                </thead>
                <tbody>
                  {output.data_pembeli.map((p, idx) => (
                    <tr key={idx} className={styles.tr}>
                      <td className={styles.td}>
                        <span className={`${styles.badge} ${getBadgeClass(p.tipe_pembeli || '')}`}>
                          {p.tipe_pembeli || 'Unknown'}
                        </span>
                      </td>
                      <td className={styles.td}>{p.nama || '-'}</td>
                      <td className={styles.td}>{p.nomor_identitas || p.npwp || '-'}</td>
                      <td className={styles.td}>{p.alamat || '-'}</td>
                      <td className={styles.td}>
                        {p.tipe_pembeli === 'perorangan' ? (
                          <>
                            {p.tempat_lahir && p.tgl_lahir && <div>Lahir: {p.tempat_lahir}, {p.tgl_lahir}</div>}
                            {p.jenis_kelamin && <div>JK: {p.jenis_kelamin}</div>}
                            {p.pekerjaan && <div>Kerja: {p.pekerjaan}</div>}
                          </>
                        ) : (
                          <>
                            {p.jenis_badan && <div>Jenis: {p.jenis_badan}</div>}
                            {p.tipe_usaha && <div>Usaha: {p.tipe_usaha}</div>}
                            {p.kota && <div>Kota: {p.kota}</div>}
                            {p.no_akta_pendirian && <div>Akta Pendirian: {p.no_akta_pendirian}</div>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Data Pihak Persetujuan */}
        {output?.data_pihak_persetujuan && output.data_pihak_persetujuan.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Data Pihak Persetujuan</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>NIK</th>
                    <th className={styles.th}>Nama</th>
                    <th className={styles.th}>Alamat</th>
                    <th className={styles.th}>Tempat/Tgl Lahir</th>
                  </tr>
                </thead>
                <tbody>
                  {output.data_pihak_persetujuan.map((p, idx) => (
                    <tr key={idx} className={styles.tr}>
                      <td className={styles.td}>{p.nik || '-'}</td>
                      <td className={styles.td}>{p.nama || '-'}</td>
                      <td className={styles.td}>{p.alamat || '-'}</td>
                      <td className={styles.td}>
                        {p.tempat_lahir} {p.tgl_lahir ? `, ${p.tgl_lahir}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Data Saksi */}
        {output?.data_saksi && output.data_saksi.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Data Saksi</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>NIK</th>
                    <th className={styles.th}>Nama</th>
                    <th className={styles.th}>Alamat</th>
                  </tr>
                </thead>
                <tbody>
                  {output.data_saksi.map((p, idx) => (
                    <tr key={idx} className={styles.tr}>
                      <td className={styles.td}>{p.nik || '-'}</td>
                      <td className={styles.td}>{p.nama || '-'}</td>
                      <td className={styles.td}>{p.alamat || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Sertifikat, PBB, BPHTB, PPh */}
        <div className={styles.grid2}>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Sertifikat</h2>
            {renderField('NIB', output?.sertifikat?.nib, 'sertifikat.nib')}
            {renderField('Nomor Hak / Kode Sertif', output?.sertifikat?.nomor_hak_atau_kode_sertif, 'sertifikat.nomor_hak_atau_kode_sertif')}
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>PBB</h2>
            {renderField('NOP', output?.pbb?.nop, 'pbb.nop')}
            {renderField('Tahun', output?.pbb?.tahun, 'pbb.tahun')}
            {renderField('Luas', output?.pbb?.luas, 'pbb.luas')}
            {renderField('NJOP', output?.pbb?.njop, 'pbb.njop')}
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>BPHTB & PPh</h2>
            {renderField('No Bukti Pembayaran BPHTB', output?.bphtb?.no_bukti_pembayaran, 'bphtb.no_bukti_pembayaran')}
            <div style={{ margin: '1rem 0' }}></div>
            {renderField('NPWP PPh', output?.pph?.npwp, 'pph.npwp')}
            {renderField('No Suket PPh', output?.pph?.no_suket, 'pph.no_suket')}
          </section>
        </div>

        {/* Hasil OCR */}
        {input_ocr && Object.keys(input_ocr).length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Hasil OCR</h2>
            {Object.entries(input_ocr).map(([key, value]) => {
              if (!value) return null;
              
              const isArray = Array.isArray(value);
              const items = isArray ? value : [value];
              
              return items.map((text, idx) => {
                if (!text || typeof text !== 'string') return null;
                const sectionKey = `${key}-${idx}`;
                const isExpanded = expandedOcr[sectionKey];
                
                return (
                  <div key={sectionKey} className={styles.ocrSection}>
                    <div className={styles.ocrHeader} onClick={() => toggleOcr(sectionKey)}>
                      <div className={styles.ocrTitle}>
                        {isExpanded ? '▼' : '▶'} {key.replace(/_/g, ' ').toUpperCase()} {isArray ? `(${idx + 1})` : ''}
                      </div>
                      <div className={styles.charCount}>{text.length} chars</div>
                    </div>
                    {isExpanded && (
                      <div className={styles.ocrBody}>
                        <pre className={styles.pre}>{text}</pre>
                      </div>
                    )}
                  </div>
                );
              });
            })}
          </section>
        )}
      </div>

      {/* Toast */}
      <div className={`${styles.toast} ${toastVisible ? styles.toastShow : ''}`}>
        ✅ Berhasil menyimpan perubahan
      </div>
    </div>
  );
}
