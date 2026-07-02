'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/adminClient';

interface Vendor {
  id: string;
  name: string;
  archived_count: number;
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchVendors = async () => {
    try {
      const data = await adminApi<any>('/vendors');
      const vendorArray = Array.isArray(data)
        ? data
        : data?.rows ?? data?.items ?? data?.data ?? [];
      setVendors(vendorArray);
    } catch {
      setVendors([]);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const showError = (msg: string) => {
    setError(msg);
    setSuccess(null);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await adminApi('/vendors', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      showSuccess('Vendor added');
      fetchVendors();
    } catch (err: any) {
      showError(err?.message || 'Failed to create vendor');
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      await adminApi(`/vendors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setEditId(null);
      showSuccess('Vendor renamed');
      fetchVendors();
    } catch (err: any) {
      showError(err?.message || 'Failed to rename vendor');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vendor? (Active products must be archived or reassigned first)')) return;
    try {
      await adminApi(`/vendors/${id}`, { method: 'DELETE' });
      showSuccess('Vendor deleted');
      fetchVendors();
    } catch (err: any) {
      showError(err?.message || 'Failed to delete vendor');
    }
  };

  const handleArchiveVendorLine = async (vendorId: string, vendorName: string) => {
    if (!confirm(`Archive all active products from vendor "${vendorName}"?`)) return;
    try {
      const result = await adminApi<{ archivedCount: number }>(
        `/vendors/${vendorId}/archive-products`,
        { method: 'POST' }
      );
      const count = result?.archivedCount ?? 0;
      showSuccess(`Archived ${count} product(s) from "${vendorName}"`);
      fetchVendors();
    } catch (err: any) {
      showError(err?.message || 'Failed to archive vendor line');
    }
  };

  const handleRestoreVendorLine = async (vendorId: string, vendorName: string) => {
    if (!confirm(`Restore all archived products from vendor "${vendorName}"?`)) return;
    try {
      const result = await adminApi<{ restoredCount: number }>(
        `/vendors/${vendorId}/restore-products`,
        { method: 'POST' }
      );
      const count = result?.restoredCount ?? 0;
      if (count === 0) {
        showError('No archived products to restore.');
      } else {
        showSuccess(`Restored ${count} product(s) from "${vendorName}"`);
      }
      fetchVendors();
    } catch (err: any) {
      showError(err?.message || 'Failed to restore vendor line');
    }
  };

  return (
    <div className="mx-auto max-w-lg p-6 bg-gray-50 min-h-screen">
      <h1 className="heading-page text-base">Manage Vendors</h1>
      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}
      <div className="flex gap-2 mb-4 mt-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New vendor name"
          className="form-input flex-1"
        />
        <button onClick={handleCreate} className="btn-primary">
          Add
        </button>
      </div>
      <ul className="space-y-2">
        {vendors.map((v) => (
          <li
            key={v.id}
            className="card !p-3 flex items-center justify-between"
          >
            {editId === v.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="form-input flex-1 mr-2"
                />
                <button
                  onClick={() => handleRename(v.id, editName)}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-800 mr-2"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditId(null)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-slate-700">{v.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditId(v.id);
                      setEditName(v.name);
                    }}
                    className="btn-link"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleArchiveVendorLine(v.id, v.name)}
                    className="btn-link text-amber-600 hover:text-amber-800"
                    title="Archive all active products from this vendor"
                  >
                    Archive all
                  </button>
                  {v.archived_count > 0 && (
                    <button
                      onClick={() => handleRestoreVendorLine(v.id, v.name)}
                      className="btn-link text-blue-600 hover:text-blue-800"
                      title={`Restore ${v.archived_count} archived product(s)`}
                    >
                      Restore all
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="btn-link text-rose-600 hover:text-rose-800"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}