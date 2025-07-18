import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { RechargeCode, User } from '../types';
import { Plus, Search, Filter, Edit3, Trash2, Package, Calendar, DollarSign, Upload, Download, FileText, AlertCircle } from 'lucide-react';

interface CodesManagementProps {
  user: User;
}

export const CodesManagement: React.FC<CodesManagementProps> = ({ user }) => {
  const [codes, setCodes] = useState<RechargeCode[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<RechargeCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingCode, setEditingCode] = useState<RechargeCode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    code: '',
    type: '1-month' as '1-month' | '3-months',
    platform: '',
    denomination: 0,
    purchasePrice: 0,
    salePrice: 0,
    purchaseDate: new Date().toISOString().split('T')[0]
  });

  const platforms = ['Envato', 'Freepik', 'Motionarray'];
  const codeTypes = [
    { value: '1-month', label: '1 mois' },
    { value: '3-months', label: '3 mois' }
  ];

  useEffect(() => {
    loadCodes();
  }, []);

  useEffect(() => {
    filterCodes();
  }, [codes, searchTerm, statusFilter, typeFilter]);

  const loadCodes = async () => {
    if (!db) return;

    try {
      const q = query(collection(db, 'rechargeCodes'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const codesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        purchaseDate: doc.data().purchaseDate?.toDate() || new Date(),
        saleDate: doc.data().saleDate?.toDate(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      })) as RechargeCode[];
      setCodes(codesData);
    } catch (error) {
      console.error('Erreur lors du chargement des codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterCodes = () => {
    let filtered = codes;

    if (searchTerm) {
      filtered = filtered.filter(code =>
        code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        code.platform.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(code => code.status === statusFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(code => code.type === typeFilter);
    }

    setFilteredCodes(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    try {
      const codeData = {
        ...formData,
        platform: formData.platform,
        purchaseDate: new Date(formData.purchaseDate),
        status: 'available' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (editingCode) {
        await updateDoc(doc(db, 'rechargeCodes', editingCode.id), {
          ...codeData,
          updatedAt: new Date()
        });
      } else {
        await addDoc(collection(db, 'rechargeCodes'), codeData);
      }

      setFormData({
        code: '',
        type: '1-month',
        platform: '',
        denomination: 0,
        purchasePrice: 0,
        salePrice: 0,
        purchaseDate: new Date().toISOString().split('T')[0]
      });
      setShowForm(false);
      setEditingCode(null);
      loadCodes();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    }
  };

  const handleSellCode = async (code: RechargeCode, customerName: string) => {
    if (!db) return;

    try {
      // Mettre à jour le code
      await updateDoc(doc(db, 'rechargeCodes', code.id), {
        status: 'sold',
        saleDate: new Date(),
        soldBy: user.id,
        soldTo: customerName,
        updatedAt: new Date()
      });

      // Créer une transaction
      await addDoc(collection(db, 'transactions'), {
        codeId: code.id,
        code: code.code,
        type: code.type,
        platform: code.platform,
        denomination: code.denomination,
        salePrice: code.salePrice,
        profit: code.salePrice - code.purchasePrice,
        soldBy: user.id,
        soldTo: customerName,
        saleDate: new Date(),
        createdAt: new Date()
      });

      loadCodes();
    } catch (error) {
      console.error('Erreur lors de la vente:', error);
    }
  };

  const deleteCode = async (codeId: string) => {
    if (!db || user.role !== 'admin') return;

    try {
      await deleteDoc(doc(db, 'rechargeCodes', codeId));
      loadCodes();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  };

  const startEdit = (code: RechargeCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      type: code.type,
      platform: code.platform,
      denomination: code.denomination,
      purchasePrice: code.purchasePrice,
      salePrice: code.salePrice,
      purchaseDate: code.purchaseDate.toISOString().split('T')[0]
    });
    setShowForm(true);
  };

  // Fonctions d'import en lot
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      parseCSVFile(file);
    }
  };

  const parseCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setImportErrors(['Le fichier doit contenir au moins une ligne d\'en-tête et une ligne de données']);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const expectedHeaders = ['code', 'type', 'platform', 'denomination', 'purchaseprice', 'saleprice', 'purchasedate'];
      
      const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        setImportErrors([`Colonnes manquantes: ${missingHeaders.join(', ')}`]);
        return;
      }

      const data = [];
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length !== headers.length) {
          errors.push(`Ligne ${i + 1}: Nombre de colonnes incorrect`);
          continue;
        }

        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });

        // Validation des données
        if (!row.code) {
          errors.push(`Ligne ${i + 1}: Code manquant`);
          continue;
        }

        if (!['1-month', '3-months'].includes(row.type)) {
          errors.push(`Ligne ${i + 1}: Type invalide (doit être "1-month" ou "3-months")`);
          continue;
        }

        if (!platforms.includes(row.platform)) {
          errors.push(`Ligne ${i + 1}: Plateforme invalide (doit être "Envato", "Freepik" ou "Motionarray")`);
          continue;
        }

        // Conversion des nombres
        row.denomination = parseFloat(row.denomination);
        row.purchaseprice = parseFloat(row.purchaseprice);
        row.saleprice = parseFloat(row.saleprice);

        if (isNaN(row.denomination) || isNaN(row.purchaseprice) || isNaN(row.saleprice)) {
          errors.push(`Ligne ${i + 1}: Valeurs numériques invalides`);
          continue;
        }

        // Validation de la date
        const date = new Date(row.purchasedate);
        if (isNaN(date.getTime())) {
          errors.push(`Ligne ${i + 1}: Date d'achat invalide`);
          continue;
        }

        data.push({
          code: row.code,
          type: row.type,
          platform: row.platform,
          denomination: row.denomination,
          purchasePrice: row.purchaseprice,
          salePrice: row.saleprice,
          purchaseDate: row.purchasedate
        });
      }

      setImportPreview(data);
      setImportErrors(errors);
    };

    reader.readAsText(file);
  };

  const handleBulkImport = async () => {
    if (!db || importPreview.length === 0) return;

    setImportLoading(true);
    try {
      const batch = writeBatch(db);
      
      importPreview.forEach((item) => {
        const docRef = doc(collection(db, 'rechargeCodes'));
        batch.set(docRef, {
          ...item,
          purchaseDate: new Date(item.purchaseDate),
          status: 'available',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      });

      await batch.commit();
      
      setShowImportModal(false);
      setImportFile(null);
      setImportPreview([]);
      setImportErrors([]);
      loadCodes();
      
      alert(`${importPreview.length} codes importés avec succès !`);
    } catch (error) {
      console.error('Erreur lors de l\'import:', error);
      alert('Erreur lors de l\'import des codes');
    } finally {
      setImportLoading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['code', 'type', 'platform', 'denomination', 'purchaseprice', 'saleprice', 'purchasedate'];
    const example = ['ABC123', '1-month', 'Envato', '50000', '45000', '55000', '2024-01-15'];
    const csvContent = [headers.join(','), example.join(',')].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_import_codes.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion des codes</h1>
          <p className="text-gray-600 mt-1">Gérez votre stock de codes d'abonnement</p>
        </div>
        {user.role === 'admin' && (
          <div className="flex space-x-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-gradient-to-r from-green-600 to-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:from-green-700 hover:to-blue-700 transition-all flex items-center space-x-2"
            >
              <Upload className="h-5 w-5" />
              <span>Import en lot</span>
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all flex items-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>Ajouter un code</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal d'import en lot */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Import en lot</h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportPreview([]);
                  setImportErrors([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Instructions d'import</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Le fichier doit être au format CSV</li>
                  <li>• Colonnes requises: code, type, platform, denomination, purchaseprice, saleprice, purchasedate</li>
                  <li>• Type: "1-month" ou "3-months"</li>
                  <li>• Platform: "Envato", "Freepik" ou "Motionarray"</li>
                  <li>• Date au format: YYYY-MM-DD</li>
                </ul>
                <button
                  onClick={downloadTemplate}
                  className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Télécharger le modèle</span>
                </button>
              </div>

              {/* Sélection de fichier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sélectionner le fichier CSV
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Erreurs */}
              {importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <h3 className="font-semibold text-red-900">Erreurs détectées</h3>
                  </div>
                  <ul className="text-sm text-red-800 space-y-1">
                    {importErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Aperçu */}
              {importPreview.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Aperçu ({importPreview.length} codes à importer)
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Code</th>
                            <th className="px-3 py-2 text-left">Durée</th>
                            <th className="px-3 py-2 text-left">Plateforme</th>
                            <th className="px-3 py-2 text-left">Valeur</th>
                            <th className="px-3 py-2 text-left">Prix achat</th>
                            <th className="px-3 py-2 text-left">Prix vente</th>
                            <th className="px-3 py-2 text-left">Date achat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {importPreview.map((item, index) => (
                            <tr key={index}>
                              <td className="px-3 py-2">{item.code}</td>
                              <td className="px-3 py-2">{item.type === '1-month' ? '1 mois' : '3 mois'}</td>
                              <td className="px-3 py-2">{item.platform}</td>
                              <td className="px-3 py-2">{item.denomination.toLocaleString()} Ar</td>
                              <td className="px-3 py-2">{item.purchasePrice.toLocaleString()} Ar</td>
                              <td className="px-3 py-2">{item.salePrice.toLocaleString()} Ar</td>
                              <td className="px-3 py-2">{item.purchaseDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Boutons d'action */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportPreview([]);
                    setImportErrors([]);
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={importPreview.length === 0 || importErrors.length > 0 || importLoading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {importLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Import en cours...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>Importer {importPreview.length} codes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtres et recherche */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Rechercher un code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Tous les statuts</option>
            <option value="available">Disponible</option>
            <option value="sold">Vendu</option>
            <option value="expired">Expiré</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Toutes les durées</option>
            {codeTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>

          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Package className="h-4 w-4" />
            <span>{filteredCodes.length} codes</span>
          </div>
        </div>
      </div>

      {/* Formulaire d'ajout/modification */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              {editingCode ? 'Modifier le code' : 'Nouveau code'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code d'abonnement
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Durée
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as '1-month' | '3-months' })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {codeTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plateforme
                </label>
                <select
                  value={formData.platform}
                  onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Sélectionner une plateforme</option>
                  {platforms.map(platform => (
                    <option key={platform} value={platform}>{platform}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valeur (Ar)
                </label>
                <input
                  type="number"
                  value={formData.denomination}
                  onChange={(e) => setFormData({ ...formData, denomination: parseFloat(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  min="0"
                  step="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix d'achat (Ar)
                </label>
                <input
                  type="number"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  min="0"
                  step="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix de vente (Ar)
                </label>
                <input
                  type="number"
                  value={formData.salePrice}
                  onChange={(e) => setFormData({ ...formData, salePrice: parseFloat(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  min="0"
                  step="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date d'achat
                </label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  {editingCode ? 'Modifier' : 'Ajouter'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCode(null);
                    setFormData({
                      code: '',
                      type: '1-month',
                      platform: '',
                      denomination: 0,
                      purchasePrice: 0,
                      salePrice: 0,
                      purchaseDate: new Date().toISOString().split('T')[0]
                    });
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-400 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Liste des codes */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durée</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plateforme</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valeur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix achat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix vente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCodes.map((code) => (
                <tr key={code.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{code.code}</div>
                    <div className="text-sm text-gray-500">
                      Acheté le {code.purchaseDate.toLocaleDateString('fr-FR')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {code.type === '1-month' ? '1 mois' : '3 mois'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{code.platform}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{code.denomination.toLocaleString()} Ar</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{code.purchasePrice.toLocaleString()} Ar</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{code.salePrice.toLocaleString()} Ar</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      code.status === 'available' ? 'bg-green-100 text-green-800' :
                      code.status === 'sold' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {code.status === 'available' ? 'Disponible' :
                       code.status === 'sold' ? 'Vendu' : 'Expiré'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {code.status === 'available' && (
                        <button
                          onClick={() => {
                            const customerName = prompt('Nom du client:');
                            if (customerName) {
                              handleSellCode(code, customerName);
                            }
                          }}
                          className="text-green-600 hover:text-green-900"
                        >
                          Vendre
                        </button>
                      )}
                      {user.role === 'admin' && (
                        <>
                          <button
                            onClick={() => startEdit(code)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Êtes-vous sûr de vouloir supprimer ce code ?')) {
                                deleteCode(code.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};