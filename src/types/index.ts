export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'vendor';
  createdAt: Date;
}

export interface RechargeCode {
  id: string;
  code: string;
  type: '1-month' | '3-months';
  platform: string;
  denomination: number;
  purchasePrice: number;
  salePrice: number;
  purchaseDate: Date;
  saleDate?: Date;
  status: 'available' | 'sold' | 'expired';
  soldBy?: string;
  soldTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  codeId: string;
  code: string;
  type: string;
  platform: string;
  denomination: number;
  salePrice: number;
  profit: number;
  soldBy: string;
  soldTo: string;
  saleDate: Date;
  createdAt: Date;
}

export interface DashboardStats {
  totalCodes: number;
  availableCodes: number;
  soldCodes: number;
  totalRevenue: number;
  totalProfit: number;
  todaysSales: number;
  monthlyRevenue: number;
}