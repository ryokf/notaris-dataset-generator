'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AktaEntry, getAllDataset, deleteDataset } from '@/lib/api';
import styles from './page.module.css';

export default function DashboardPage() {
  const [data, setData] = useState<AktaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<AktaEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await getAllDataset();
        setData(result || []);
      } catch (err: any) {
        console.error('Failed to fetch dataset:', err);
        setError('Server Rust Backend (port 3000) belum dinyalakan. Jalankan `cargo run` pada folder backend.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const lowerSearch = searchTerm.toLowerCase();
    return data.filter(item => {
      const output = item.output;
      if (!output) return false;
      const matchNoAkta = output.no_akta?.toLowerCase().includes(lowerSearch);
      const matchAktaId = item.akta_id?.toLowerCase().includes(lowerSearch);
      const penjualName = output.data_penjual?.[0]?.nama?.toLowerCase() || '';
      const pembeliName = output.data_pembeli?.[0]?.nama?.toLowerCase() || '';
      return matchNoAkta || matchAktaId || penjualName.includes(lowerSearch) || pembeliName.includes(lowerSearch);
    });
  }, [data, searchTerm]);

  const handleDeleteClick = (item: AktaEntry) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setIsDeleting(true);
      await deleteDataset(itemToDelete.akta_id);
      setData(prev => prev.filter(d => d.akta_id !== itemToDelete.akta_id));
      setDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Failed to delete dataset:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatRupiah = (value: string | number | undefined) => {
    if (!value) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g, '')) : value;
    if (isNaN(num)) return value;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          Dataset ATRBPN
          {!loading && <span className={styles.badge}>{data.length}</span>}
        </div>
        
        <div className={styles.searchContainer}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="Search no akta, id, or names..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      <main className={styles.card}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>No</th>
                <th>No Akta</th>
                <th>Tanggal</th>
                <th>Penjual</th>
                <th>Pembeli</th>
                <th>Nilai Akta</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className={styles.skeletonRow}>
                    <td><div className={styles.skeletonCell} style={{ width: '20px' }}></div></td>
                    <td><div className={styles.skeletonCell} style={{ width: '120px' }}></div></td>
                    <td><div className={styles.skeletonCell} style={{ width: '100px' }}></div></td>
                    <td><div className={styles.skeletonCell} style={{ width: '150px' }}></div></td>
                    <td><div className={styles.skeletonCell} style={{ width: '150px' }}></div></td>
                    <td><div className={styles.skeletonCell} style={{ width: '120px' }}></div></td>
                    <td><div className={styles.skeletonCell} style={{ width: '100px' }}></div></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.emptyState}>
                      <span className={styles.emptyIcon}>🔌</span>
                      <p style={{ color: '#ef4444', fontWeight: 600 }}>Backend Tidak Terhubung</p>
                      <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem' }}>{error}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.emptyState}>
                      <span className={styles.emptyIcon}>📭</span>
                      <p>Belum ada data</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((item, index) => {
                  const output = item.output || {};
                  const penjual = output.data_penjual?.[0]?.nama || '-';
                  const pembeli = output.data_pembeli?.[0]?.nama || '-';
                  
                  return (
                    <tr key={item.akta_id}>
                      <td>{index + 1}</td>
                      <td>{output.no_akta || '-'}</td>
                      <td>{output.tanggal_akta || '-'}</td>
                      <td>{penjual}</td>
                      <td>{pembeli}</td>
                      <td>{formatRupiah(output.nilai_akta)}</td>
                      <td>
                        <div className={styles.actions}>
                          <Link href={`/akta/${item.akta_id}`} className={styles.viewBtn}>
                            View <span>→</span>
                          </Link>
                          <button 
                            className={styles.deleteBtn}
                            onClick={() => handleDeleteClick(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {deleteModalOpen && itemToDelete && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Delete Entry</h3>
            <p className={styles.modalText}>
              Are you sure you want to delete data for Akta ID <strong>{itemToDelete.akta_id}</strong>? This action cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button 
                className={`${styles.modalBtn} ${styles.cancelBtn}`}
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className={`${styles.modalBtn} ${styles.confirmBtn}`}
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
