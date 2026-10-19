export interface Branch {
  id: string;
  nameAr: string;
  /** Buses available per day (7 / 7 / 3). */
  busesPerDay: number;
}

export interface Department {
  id: string;
  nameAr: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  typeAr: string;
  branchId: string | null;
  mileage: number;
  status: 'active' | 'in_workshop' | 'retired';
  /** Seats, for buses. */
  seats?: number;
  nextPreventiveDate?: string;
}

export interface Driver {
  id: string;
  nameAr: string;
  mobile: string;
  licenseNo: string;
  branchId: string | null;
  active: boolean;
}

export interface WarehouseItem {
  id: string;
  code: string;
  nameAr: string;
  unitAr: string;
  stock: number;
  reorderLevel: number;
  location: string;
  unitPrice: number;
}

export interface Supplier {
  id: string;
  nameAr: string;
  contactAr: string;
  mobile: string;
}

/** A simple editable list used by `admin/reference` (specialties, trip purposes, ...). */
export interface RefListItem {
  id: string;
  nameAr: string;
}

export interface RefLists {
  maintenanceSpecialties: RefListItem[];
  vehicleMaintenanceTypes: RefListItem[];
  tripPurposes: RefListItem[];
  complaintCategories: RefListItem[];
  blockedDays: Array<{ id: string; date: string; reasonAr: string }>;
}
