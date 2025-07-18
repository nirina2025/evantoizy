import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { AuthForm } from './components/AuthForm';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { CodesManagement } from './components/CodesManagement';
import { TransactionHistory } from './components/TransactionHistory';
import { Loader2 } from 'lucide-react';

function App() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <span className="text-lg text-white">Chargement...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard userRole={user.role} />;
      case 'codes':
        return <CodesManagement user={user} />;
      case 'transactions':
        return <TransactionHistory user={user} />;
      default:
        return <Dashboard userRole={user.role} />;
    }
  };

  return (
    <Layout 
      user={user} 
      currentView={currentView} 
      onViewChange={setCurrentView}
    >
      {renderContent()}
    </Layout>
  );
}

export default App;