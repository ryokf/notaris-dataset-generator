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
  const [editMode, setEditMode] = useState<'form' | 'json'>('form');

  // Full entry state when editing
  const [fullEditData, setFullEditData] = useState<AktaEntry | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [expandedOcr, setExpandedOcr] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchAkta() {
      try {
        const result = await getOneDataset(id);
        setData(result);
        setFullEditData(result);
        setJsonText(JSON.stringify(result, null, 2));
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

  const handleStartEdit = () => {
    if (data) {
      setFullEditData(JSON.parse(JSON.stringify(data)));
      setJsonText(JSON.stringify(data, null, 2));
      setJsonError(null);
    }
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!id) return;

    let payloadToSave: AktaEntry;

    if (editMode === 'json') {
      try {
        payloadToSave = JSON.parse(jsonText);
        setJsonError(null);
      } catch (err: any) {
        setJsonError(`JSON Syntax Error: ${err.message}`);
        return;
      }
    } else {
      if (!fullEditData) return;
      payloadToSave = fullEditData;
    }

    try {
      const updatedData = await updateDataset(id, payloadToSave);
      setData(updatedData);
      setFullEditData(updatedData);
      setJsonText(JSON.stringify(updatedData, null, 2));
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

  const toggleOcr = (key: string) => {
    setExpandedOcr(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper to handle nested edits in fullEditData
  const updateFormNested = (path: string, value: any) => {
    if (!fullEditData) return;
    const updated = JSON.parse(JSON.stringify(fullEditData));
    const parts = path.split('.');
    let curr: any = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) curr[parts[i]] = {};
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = value;
    setFullEditData(updated);
    setJsonText(JSON.stringify(updated, null, 2));
  };

  // Helper for OCR text edits
  const updateOcrField = (key: string, value: any, index?: number) => {
    if (!fullEditData) return;
    const updated = JSON.parse(JSON.stringify(fullEditData));
    if (!updated.input_ocr) updated.input_ocr = {};

    if (index !== undefined && Array.isArray(updated.input_ocr[key])) {
      updated.input_ocr[key][index] = value;
    } else {
      updated.input_ocr[key] = value;
    }
    setFullEditData(updated);
    setJsonText(JSON.stringify(updated, null, 2));
  };

  // Helper for array item manipulation (Penjual / Pembeli / Saksi)
  const updateArrayItem = (arrayKey: 'data_penjual' | 'data_pembeli' | 'data_pihak_persetujuan' | 'data_saksi', index: number, field: string, value: any) => {
    if (!fullEditData) return;
    const updated = JSON.parse(JSON.stringify(fullEditData));
    if (!updated.output[arrayKey]) updated.output[arrayKey] = [];
    if (updated.output[arrayKey][index]) {
      updated.output[arrayKey][index][field] = value;
    }
    setFullEditData(updated);
    setJsonText(JSON.stringify(updated, null, 2));
  };

  const addArrayItem = (arrayKey: 'data_penjual' | 'data_pembeli' | 'data_pihak_persetujuan' | 'data_saksi', newItem: any) => {
    if (!fullEditData) return;
    const updated = JSON.parse(JSON.stringify(fullEditData));
    if (!updated.output[arrayKey]) updated.output[arrayKey] = [];
    updated.output[arrayKey].push(newItem);
    setFullEditData(updated);
    setJsonText(JSON.stringify(updated, null, 2));
  };

  const removeArrayItem = (arrayKey: 'data_penjual' | 'data_pembeli' | 'data_pihak_persetujuan' | 'data_saksi', index: number) => {
    if (!fullEditData) return;
    const updated = JSON.parse(JSON.stringify(fullEditData));
    if (updated.output[arrayKey]) {
      updated.output[arrayKey].splice(index, 1);
    }
    setFullEditData(updated);
    setJsonText(JSON.stringify(updated, null, 2));
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
        <Link href="/" className={styles.backButton} style={{ marginTop: '1rem' }}>
          &larr; Kembali ke Beranda
        </Link>
      </div>
    );
  }

  const currentDisplay = isEditing && fullEditData ? fullEditData : data;
  const { input_ocr, output, form_source, akta_id } = currentDisplay;

  const renderField = (label: string, value: any, fieldPath?: string) => {
    const editVal = fieldPath
      ? fieldPath.split('.').reduce((acc: any, curr) => acc?.[curr], fullEditData) || ''
      : value || '';

    return (
      <div className={styles.fieldGroup}>
        <span className={styles.label}>{label}</span>
        {isEditing && fieldPath ? (
          <input
            type="text"
            className={`${styles.input} ${styles.inputGlow}`}
            value={editVal}
            onChange={(e) => updateFormNested(fieldPath, e.target.value)}
          />
        ) : (
          <div className={styles.value}>{value || '-'}</div>
        )}
      </div>
    );
  };

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

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {isEditing && (
            <div className={styles.modeToggleGroup}>
              <button
                className={`${styles.modeToggleBtn} ${editMode === 'form' ? styles.modeToggleBtnActive : ''}`}
                onClick={() => setEditMode('form')}
              >
                🖥️ Form Mode
              </button>
              <button
                className={`${styles.modeToggleBtn} ${editMode === 'json' ? styles.modeToggleBtnActive : ''}`}
                onClick={() => {
                  if (fullEditData) setJsonText(JSON.stringify(fullEditData, null, 2));
                  setEditMode('json');
                }}
              >
                💻 Raw JSON Mode
              </button>
            </div>
          )}

          {isEditing ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className={styles.saveButton} onClick={handleSave}>
                💾 Simpan
              </button>
              <button
                className={styles.editButton}
                style={{ background: 'rgba(255,255,255,0.05)' }}
                onClick={() => {
                  setIsEditing(false);
                  setJsonError(null);
                }}
              >
                ❌ Batal
              </button>
            </div>
          ) : (
            <button className={styles.editButton} onClick={handleStartEdit}>
              ✏️ Edit Semua Data
            </button>
          )}
        </div>
      </div>

      {/* RAW JSON EDIT MODE */}
      {isEditing && editMode === 'json' ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>💻 Edit Raw JSON Dataset</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Anda dapat langsung mengedit seluruh struktur JSON secara manual di bawah ini.
          </p>
          <textarea
            className={styles.jsonTextarea}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              try {
                const parsed = JSON.parse(e.target.value);
                setFullEditData(parsed);
                setJsonError(null);
              } catch (err: any) {
                setJsonError(err.message);
              }
            }}
          />
          {jsonError && <div className={styles.jsonError}>⚠️ {jsonError}</div>}
        </section>
      ) : (
        <div className={styles.content}>
          {/* Info Akta */}
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Info Akta</h2>
            <div className={styles.grid2}>
              {renderField('Nomor Akta', output?.no_akta, 'output.no_akta')}
              {renderField('Tanggal Akta', output?.tanggal_akta, 'output.tanggal_akta')}
              {renderField('Nilai Akta', output?.nilai_akta, 'output.nilai_akta')}
              {renderField('Form Source', form_source, 'form_source')}
              <div className={styles.fieldGroup}>
                <span className={styles.label}>Akta ID</span>
                <div className={`${styles.value} ${styles.readonlyText}`}>{akta_id || id}</div>
              </div>
            </div>
          </section>

          {/* Data Penjual */}
          <section className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Data Penjual ({output?.data_penjual?.length || 0})</h2>
              {isEditing && (
                <button
                  className={styles.itemAddBtn}
                  onClick={() => addArrayItem('data_penjual', { tipe_penjual: 'perorangan', nama: '', nomor_identitas: '', alamat: '' })}
                >
                  ➕ Tambah Penjual
                </button>
              )}
            </div>

            {isEditing ? (
              <div>
                {(fullEditData?.output?.data_penjual || []).map((p: any, idx: number) => (
                  <div key={idx} className={styles.arrayItemCard}>
                    <div className={styles.arrayItemHeader}>
                      <span>Penjual #{idx + 1} ({p.tipe_penjual || 'perorangan'})</span>
                      <button className={styles.itemRemoveBtn} onClick={() => removeArrayItem('data_penjual', idx)}>
                        🗑️ Hapus
                      </button>
                    </div>
                    <div className={styles.grid2}>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Tipe Penjual</span>
                        <select
                          className={styles.input}
                          value={p.tipe_penjual || 'perorangan'}
                          onChange={(e) => updateArrayItem('data_penjual', idx, 'tipe_penjual', e.target.value)}
                        >
                          <option value="perorangan">Perorangan</option>
                          <option value="badan hukum">Badan Hukum</option>
                          <option value="lembaga non ahu">Lembaga Non AHU</option>
                        </select>
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Nama</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.nama || ''}
                          onChange={(e) => updateArrayItem('data_penjual', idx, 'nama', e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Identitas / NIK / Kode Subyek</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.nomor_identitas || p.kode_subyek || ''}
                          onChange={(e) => updateArrayItem('data_penjual', idx, p.tipe_penjual === 'lembaga non ahu' ? 'kode_subyek' : 'nomor_identitas', e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Alamat</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.alamat || ''}
                          onChange={(e) => updateArrayItem('data_penjual', idx, 'alamat', e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>NPWP</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.npwp || ''}
                          onChange={(e) => updateArrayItem('data_penjual', idx, 'npwp', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              output?.data_penjual && output.data_penjual.length > 0 ? (
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
                      {output.data_penjual.map((p: any, idx: number) => (
                        <tr key={idx} className={styles.tr}>
                          <td className={styles.td}>
                            <span className={`${styles.badge} ${getBadgeClass(p.tipe_penjual || '')}`}>
                              {p.tipe_penjual || 'Unknown'}
                            </span>
                          </td>
                          <td className={styles.td}>{p.nama || '-'}</td>
                          <td className={styles.td}>{p.nomor_identitas || p.kode_subyek || p.npwp || '-'}</td>
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
              ) : <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Belum ada data penjual</p>
            )}
          </section>

          {/* Data Pembeli */}
          <section className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Data Pembeli ({output?.data_pembeli?.length || 0})</h2>
              {isEditing && (
                <button
                  className={styles.itemAddBtn}
                  onClick={() => addArrayItem('data_pembeli', { tipe_pembeli: 'perorangan', nama: '', nomor_identitas: '', alamat: '' })}
                >
                  ➕ Tambah Pembeli
                </button>
              )}
            </div>

            {isEditing ? (
              <div>
                {(fullEditData?.output?.data_pembeli || []).map((p: any, idx: number) => (
                  <div key={idx} className={styles.arrayItemCard}>
                    <div className={styles.arrayItemHeader}>
                      <span>Pembeli #{idx + 1} ({p.tipe_pembeli || 'perorangan'})</span>
                      <button className={styles.itemRemoveBtn} onClick={() => removeArrayItem('data_pembeli', idx)}>
                        🗑️ Hapus
                      </button>
                    </div>
                    <div className={styles.grid2}>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Tipe Pembeli</span>
                        <select
                          className={styles.input}
                          value={p.tipe_pembeli || 'perorangan'}
                          onChange={(e) => updateArrayItem('data_pembeli', idx, 'tipe_pembeli', e.target.value)}
                        >
                          <option value="perorangan">Perorangan</option>
                          <option value="badan hukum">Badan Hukum</option>
                          <option value="lembaga non ahu">Lembaga Non AHU</option>
                        </select>
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Nama</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.nama || ''}
                          onChange={(e) => updateArrayItem('data_pembeli', idx, 'nama', e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Identitas / NIK / Kode Subyek</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.nomor_identitas || p.kode_subyek || ''}
                          onChange={(e) => updateArrayItem('data_pembeli', idx, p.tipe_pembeli === 'lembaga non ahu' ? 'kode_subyek' : 'nomor_identitas', e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>Alamat</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.alamat || ''}
                          onChange={(e) => updateArrayItem('data_pembeli', idx, 'alamat', e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <span className={styles.label}>NPWP</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={p.npwp || ''}
                          onChange={(e) => updateArrayItem('data_pembeli', idx, 'npwp', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              output?.data_pembeli && output.data_pembeli.length > 0 ? (
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
                      {output.data_pembeli.map((p: any, idx: number) => (
                        <tr key={idx} className={styles.tr}>
                          <td className={styles.td}>
                            <span className={`${styles.badge} ${getBadgeClass(p.tipe_pembeli || '')}`}>
                              {p.tipe_pembeli || 'Unknown'}
                            </span>
                          </td>
                          <td className={styles.td}>{p.nama || '-'}</td>
                          <td className={styles.td}>{p.nomor_identitas || p.kode_subyek || p.npwp || '-'}</td>
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
              ) : <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Belum ada data pembeli</p>
            )}
          </section>

          {/* Sertifikat, PBB, BPHTB, PPh */}
          <div className={styles.grid2}>
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>Sertifikat</h2>
              {renderField('NIB', output?.sertifikat?.nib, 'output.sertifikat.nib')}
              {renderField('Nomor Hak / Kode Sertif', output?.sertifikat?.nomor_hak_atau_kode_sertif, 'output.sertifikat.nomor_hak_atau_kode_sertif')}
            </section>

            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>PBB</h2>
              {renderField('NOP', output?.pbb?.nop, 'output.pbb.nop')}
              {renderField('Tahun', output?.pbb?.tahun, 'output.pbb.tahun')}
              {renderField('Luas', output?.pbb?.luas, 'output.pbb.luas')}
              {renderField('NJOP', output?.pbb?.njop, 'output.pbb.njop')}
            </section>

            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>BPHTB & PPh</h2>
              {renderField('No Bukti Pembayaran BPHTB', output?.bphtb?.no_bukti_pembayaran, 'output.bphtb.no_bukti_pembayaran')}
              <div style={{ margin: '1rem 0' }}></div>
              {renderField('NPWP PPh', output?.pph?.npwp, 'output.pph.npwp')}
              {renderField('No Suket PPh', output?.pph?.no_suket, 'output.pph.no_suket')}
            </section>
          </div>

          {/* Hasil OCR (Bisa Di-edit Saat Mode Edit) */}
          {input_ocr && Object.keys(input_ocr).length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>Hasil OCR (Teks Hasil Scan)</h2>
              {Object.entries(input_ocr).map(([key, value]) => {
                if (value === undefined || value === null) return null;

                const isArray = Array.isArray(value);
                const items = isArray ? value : [value];

                return items.map((text, idx) => {
                  const sectionKey = `${key}-${idx}`;
                  const isExpanded = expandedOcr[sectionKey] || isEditing;

                  return (
                    <div key={sectionKey} className={styles.ocrSection}>
                      <div className={styles.ocrHeader} onClick={() => toggleOcr(sectionKey)}>
                        <div className={styles.ocrTitle}>
                          {isExpanded ? '▼' : '▶'} {key.replace(/_/g, ' ').toUpperCase()} {isArray ? `(${idx + 1})` : ''}
                        </div>
                        <div className={styles.charCount}>{typeof text === 'string' ? text.length : 0} chars</div>
                      </div>
                      {isExpanded && (
                        <div className={styles.ocrBody}>
                          {isEditing ? (
                            <textarea
                              className={styles.ocrTextarea}
                              value={text || ''}
                              onChange={(e) => updateOcrField(key, e.target.value, isArray ? idx : undefined)}
                            />
                          ) : (
                            <pre className={styles.pre}>{text || '-'}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })}
            </section>
          )}
        </div>
      )}

      {/* Toast */}
      <div className={`${styles.toast} ${toastVisible ? styles.toastShow : ''}`}>
        ✅ Berhasil menyimpan semua perubahan!
      </div>
    </div>
  );
}
