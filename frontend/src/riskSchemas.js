// Defines which risk fields to capture per sub-vertical — e.g. a Private
// Car policy captures registration/engine/chassis numbers, a Fire policy
// captures building/stock details. Many sub-verticals share the same real-
// world shape (the three GCV variants all just need vehicle + GVW details),
// so sub-verticals map to a smaller set of shared templates rather than
// each having a bespoke field list.
//
// Field types: text, number, date, select (needs `options`), checkbox,
// member_list (repeatable name/relationship/age/gender rows).
//
// Adding a new sub-vertical later that doesn't fit an existing template:
// add a new entry to RISK_TEMPLATES and point to it from
// SUB_VERTICAL_TEMPLATES below.

export const RISK_TEMPLATES = {
  MOTOR_CAR: [
    { key: 'registration_number', label: 'Registration number', type: 'text' },
    { key: 'vehicle_make', label: 'Make', type: 'text' },
    { key: 'vehicle_model', label: 'Model', type: 'text' },
    { key: 'fuel', label: 'Fuel', type: 'select', options: ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'] },
    { key: 'manufacturing_year', label: 'Manufacturing year', type: 'number' },
    { key: 'engine_number', label: 'Engine number', type: 'text' },
    { key: 'chassis_number', label: 'Chassis number', type: 'text' },
    { key: 'cc', label: 'CC', type: 'number' },
    { key: 'seating_capacity', label: 'Seating capacity', type: 'number' },
    { key: 'idv', label: 'IDV', type: 'number' },
    { key: 'ncb_percent', label: 'NCB %', type: 'number' },
  ],
  MOTOR_TWO_WHEELER: [
    { key: 'registration_number', label: 'Registration number', type: 'text' },
    { key: 'vehicle_make', label: 'Make', type: 'text' },
    { key: 'vehicle_model', label: 'Model', type: 'text' },
    { key: 'variant', label: 'Variant', type: 'text' },
    { key: 'fuel', label: 'Fuel', type: 'select', options: ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'] },
    { key: 'manufacturing_year', label: 'Manufacturing year', type: 'number' },
    { key: 'engine_number', label: 'Engine number', type: 'text' },
    { key: 'chassis_number', label: 'Chassis number', type: 'text' },
    { key: 'cc', label: 'CC', type: 'number' },
    { key: 'idv', label: 'IDV', type: 'number' },
    { key: 'ncb_percent', label: 'NCB %', type: 'number' },
  ],
  MOTOR_PCV: [
    { key: 'registration_number', label: 'Registration number', type: 'text' },
    { key: 'vehicle_make', label: 'Make', type: 'text' },
    { key: 'vehicle_model', label: 'Model', type: 'text' },
    { key: 'fuel', label: 'Fuel', type: 'select', options: ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC'] },
    { key: 'manufacturing_year', label: 'Manufacturing year', type: 'number' },
    { key: 'engine_number', label: 'Engine number', type: 'text' },
    { key: 'chassis_number', label: 'Chassis number', type: 'text' },
    { key: 'cc', label: 'CC', type: 'number' },
    { key: 'seating_capacity', label: 'Seating capacity', type: 'number' },
    { key: 'idv', label: 'IDV', type: 'number' },
    { key: 'ncb_percent', label: 'NCB %', type: 'number' },
  ],
  MOTOR_GCV: [
    { key: 'registration_number', label: 'Registration number', type: 'text' },
    { key: 'vehicle_make', label: 'Make', type: 'text' },
    { key: 'vehicle_model', label: 'Model', type: 'text' },
    { key: 'fuel', label: 'Fuel', type: 'select', options: ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC'] },
    { key: 'manufacturing_year', label: 'Manufacturing year', type: 'number' },
    { key: 'engine_number', label: 'Engine number', type: 'text' },
    { key: 'chassis_number', label: 'Chassis number', type: 'text' },
    { key: 'cc', label: 'CC', type: 'number' },
    { key: 'gvw', label: 'GVW (kg)', type: 'number' },
    { key: 'idv', label: 'IDV', type: 'number' },
    { key: 'ncb_percent', label: 'NCB %', type: 'number' },
  ],
  MOTOR_MISC: [
    { key: 'registration_number', label: 'Registration number', type: 'text' },
    { key: 'vehicle_type', label: 'Vehicle type', type: 'text' },
    { key: 'vehicle_make', label: 'Make', type: 'text' },
    { key: 'vehicle_model', label: 'Model', type: 'text' },
    { key: 'fuel', label: 'Fuel', type: 'select', options: ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC'] },
    { key: 'manufacturing_year', label: 'Manufacturing year', type: 'number' },
    { key: 'engine_number', label: 'Engine number', type: 'text' },
    { key: 'chassis_number', label: 'Chassis number', type: 'text' },
    { key: 'gvw', label: 'GVW (kg)', type: 'number' },
    { key: 'idv', label: 'IDV', type: 'number' },
    { key: 'ncb_percent', label: 'NCB %', type: 'number' },
  ],

  HEALTH_INDIVIDUAL: [
    { key: 'insured_name', label: 'Insured name', type: 'text' },
    { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['MALE', 'FEMALE', 'OTHER'] },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
    { key: 'plan', label: 'Plan', type: 'text' },
    { key: 'room_rent_limit', label: 'Room rent limit', type: 'select', options: ['NO_LIMIT', 'SINGLE_PRIVATE', 'TWIN_SHARING', 'GENERAL_WARD'] },
    { key: 'pre_existing_disease', label: 'Pre-existing disease', type: 'checkbox' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'occupation', label: 'Occupation', type: 'text' },
  ],
  HEALTH_FAMILY_FLOATER: [
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
    { key: 'plan', label: 'Plan', type: 'text' },
    { key: 'members', label: 'Members', type: 'member_list' },
    { key: 'room_rent_limit', label: 'Room rent limit', type: 'select', options: ['NO_LIMIT', 'SINGLE_PRIVATE', 'TWIN_SHARING', 'GENERAL_WARD'] },
    { key: 'pre_existing_disease', label: 'Pre-existing disease', type: 'checkbox' },
  ],
  HEALTH_GROUP: [
    { key: 'organization_name', label: 'Organization name', type: 'text' },
    { key: 'employee_count', label: 'Employee count', type: 'number' },
    { key: 'sum_insured_per_member', label: 'Sum insured per member', type: 'number' },
    { key: 'total_sum_insured', label: 'Total sum insured', type: 'number' },
    { key: 'dependents_covered', label: 'Dependents covered', type: 'checkbox' },
    { key: 'room_rent_limit', label: 'Room rent limit', type: 'select', options: ['NO_LIMIT', 'SINGLE_PRIVATE', 'TWIN_SHARING', 'GENERAL_WARD'] },
    { key: 'pre_existing_disease', label: 'Pre-existing disease', type: 'checkbox' },
    { key: 'maternity_cover', label: 'Maternity cover', type: 'checkbox' },
  ],
  PERSONAL_ACCIDENT: [
    { key: 'insured_name', label: 'Insured / organization name', type: 'text' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'occupation', label: 'Occupation', type: 'text' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
    { key: 'accidental_death', label: 'Accidental death', type: 'checkbox' },
    { key: 'permanent_total_disability', label: 'Permanent total disability', type: 'checkbox' },
    { key: 'permanent_partial_disability', label: 'Permanent partial disability', type: 'checkbox' },
    { key: 'temporary_total_disability', label: 'Temporary total disability', type: 'checkbox' },
    { key: 'accidental_medical_expenses', label: 'Accidental medical expenses', type: 'number' },
  ],
  TRAVEL: [
    { key: 'insured_name', label: 'Insured name', type: 'text' },
    { key: 'destination', label: 'Destination', type: 'text' },
    { key: 'trip_type', label: 'Trip type', type: 'select', options: ['SINGLE_TRIP', 'MULTI_TRIP', 'ANNUAL'] },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'end_date', label: 'End date', type: 'date' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
    { key: 'medical_expenses', label: 'Medical expenses', type: 'number' },
    { key: 'baggage_cover', label: 'Baggage cover', type: 'number' },
    { key: 'trip_cancellation', label: 'Trip cancellation', type: 'number' },
  ],

  LIFE_INDIVIDUAL: [
    { key: 'insured_name', label: 'Insured name', type: 'text' },
    { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['MALE', 'FEMALE', 'OTHER'] },
    { key: 'sum_assured', label: 'Sum assured', type: 'number' },
    { key: 'policy_term_years', label: 'Policy term (years)', type: 'number' },
    { key: 'premium_payment_term_years', label: 'Premium payment term (years)', type: 'number' },
    { key: 'smoker', label: 'Smoker', type: 'checkbox' },
    { key: 'occupation', label: 'Occupation', type: 'text' },
    { key: 'annual_income', label: 'Annual income', type: 'number' },
    { key: 'nominee', label: 'Nominee', type: 'text' },
    { key: 'relationship_with_nominee', label: 'Relationship with nominee', type: 'text' },
  ],
  LIFE_GROUP: [
    { key: 'organization_name', label: 'Organization name', type: 'text' },
    { key: 'employee_count', label: 'Employee count', type: 'number' },
    { key: 'sum_assured_per_member', label: 'Sum assured per member', type: 'number' },
    { key: 'total_sum_assured', label: 'Total sum assured', type: 'number' },
  ],

  FIRE: [
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'occupancy', label: 'Occupancy', type: 'text' },
    { key: 'building_type', label: 'Building type', type: 'select', options: ['RCC', 'STEEL', 'OTHER'] },
    { key: 'construction_year', label: 'Construction year', type: 'number' },
    { key: 'building_area_sqft', label: 'Building area (sqft)', type: 'number' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
    { key: 'floor_count', label: 'Floor count', type: 'number' },
    { key: 'stock_type', label: 'Stock type', type: 'text' },
    { key: 'stock_description', label: 'Stock description', type: 'text' },
    { key: 'maximum_stock_value', label: 'Maximum stock value', type: 'number' },
  ],
  BURGLARY: [
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'occupancy', label: 'Occupancy', type: 'text' },
    { key: 'building_type', label: 'Building type', type: 'select', options: ['RCC', 'STEEL', 'OTHER'] },
    { key: 'stock_sum_insured', label: 'Stock sum insured', type: 'number' },
    { key: 'contents_sum_insured', label: 'Contents sum insured', type: 'number' },
    { key: 'furniture_sum_insured', label: 'Furniture sum insured', type: 'number' },
    { key: 'cash_in_safe', label: 'Cash in safe', type: 'number' },
    { key: 'cash_in_transit', label: 'Cash in transit', type: 'number' },
    { key: 'total_sum_insured', label: 'Total sum insured', type: 'number' },
    { key: 'security_system', label: 'Security system', type: 'text' },
  ],
  SHOPKEEPERS: [
    { key: 'shop_name', label: 'Shop name', type: 'text' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'occupancy', label: 'Occupancy', type: 'text' },
    { key: 'building_sum_insured', label: 'Building sum insured', type: 'number' },
    { key: 'stock_sum_insured', label: 'Stock sum insured', type: 'number' },
    { key: 'contents_sum_insured', label: 'Contents sum insured', type: 'number' },
    { key: 'burglary_sum_insured', label: 'Burglary sum insured', type: 'number' },
    { key: 'money_sum_insured', label: 'Money sum insured', type: 'number' },
    { key: 'liability_sum_insured', label: 'Liability sum insured', type: 'number' },
    { key: 'total_sum_insured', label: 'Total sum insured', type: 'number' },
  ],

  MARINE_CARGO: [
    { key: 'cargo_description', label: 'Cargo description', type: 'text' },
    { key: 'commodity_type', label: 'Commodity type', type: 'text' },
    { key: 'invoice_value', label: 'Invoice value', type: 'number' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
    { key: 'origin', label: 'Origin', type: 'text' },
    { key: 'destination', label: 'Destination', type: 'text' },
    { key: 'mode_of_transport', label: 'Mode of transport', type: 'select', options: ['ROAD', 'RAIL', 'AIR', 'SEA', 'MULTIMODAL'] },
    { key: 'transit_type', label: 'Transit type', type: 'select', options: ['WAREHOUSE_TO_WAREHOUSE', 'PORT_TO_PORT'] },
    { key: 'packing', label: 'Packing', type: 'text' },
    { key: 'voyage_start_date', label: 'Voyage start date', type: 'date' },
  ],
  MARINE_HULL: [
    { key: 'vessel_name', label: 'Vessel name', type: 'text' },
    { key: 'vessel_type', label: 'Vessel type', type: 'text' },
    { key: 'year_built', label: 'Year built', type: 'number' },
    { key: 'gross_tonnage', label: 'Gross tonnage', type: 'number' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
    { key: 'navigation_area', label: 'Navigation area', type: 'text' },
    { key: 'port_of_registration', label: 'Port of registration', type: 'text' },
  ],

  CONTRACTOR_ALL_RISK: [
    { key: 'project_name', label: 'Project name', type: 'text' },
    { key: 'project_location', label: 'Project location', type: 'text' },
    { key: 'project_value', label: 'Project value', type: 'number' },
    { key: 'contract_period_months', label: 'Contract period (months)', type: 'number' },
    { key: 'construction_type', label: 'Construction type', type: 'text' },
    { key: 'civil_works_sum_insured', label: 'Civil works sum insured', type: 'number' },
    { key: 'plant_machinery_sum_insured', label: 'Plant & machinery sum insured', type: 'number' },
    { key: 'debris_removal_sum_insured', label: 'Debris removal sum insured', type: 'number' },
  ],
  CONTRACTOR_PLANT: [
    { key: 'project_name', label: 'Project name', type: 'text' },
    { key: 'project_location', label: 'Project location', type: 'text' },
    { key: 'machine_type', label: 'Machine type', type: 'text' },
    { key: 'machine_make', label: 'Machine make', type: 'text' },
    { key: 'machine_model', label: 'Machine model', type: 'text' },
    { key: 'manufacturing_year', label: 'Manufacturing year', type: 'number' },
    { key: 'machine_value', label: 'Machine value', type: 'number' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
  ],

  LIABILITY: [
    { key: 'business_name', label: 'Business / organization name', type: 'text' },
    { key: 'business_type', label: 'Business type / industry', type: 'text' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'limit_of_liability', label: 'Limit of liability', type: 'number' },
    { key: 'any_one_accident', label: 'Any one accident', type: 'number' },
    { key: 'any_one_year', label: 'Any one year', type: 'number' },
    { key: 'employee_count', label: 'Employee count', type: 'number' },
    { key: 'annual_turnover', label: 'Annual turnover / wages', type: 'number' },
  ],
  CYBER: [
    { key: 'business_name', label: 'Business name', type: 'text' },
    { key: 'business_type', label: 'Business type / industry', type: 'text' },
    { key: 'annual_turnover', label: 'Annual turnover', type: 'number' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
  ],
  FIDELITY_GUARANTEE: [
    { key: 'business_name', label: 'Business name', type: 'text' },
    { key: 'employees_covered', label: 'Employees covered', type: 'number' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
  ],
  PET: [
    { key: 'pet_name', label: 'Pet name', type: 'text' },
    { key: 'species', label: 'Species', type: 'text' },
    { key: 'breed', label: 'Breed', type: 'text' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
  ],
  GENERIC: [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'sum_insured', label: 'Sum insured', type: 'number' },
  ],
};

// Maps each real sub-vertical name (as stored in sub_verticals.name) to a
// template above. Sub-verticals with no bespoke example yet reuse the
// closest matching template rather than getting a one-off shape.
export const SUB_VERTICAL_TEMPLATES = {
  // Motor
  'Private Car': 'MOTOR_CAR',
  'Two Wheeler': 'MOTOR_TWO_WHEELER',
  'GCV - 3 Wheeler': 'MOTOR_GCV',
  'GCV - 4 Wheeler': 'MOTOR_GCV',
  'GCV - Truck': 'MOTOR_GCV',
  'PCV - 3 Wheeler': 'MOTOR_PCV',
  'PCV - 4 Wheeler': 'MOTOR_PCV',
  'PCV - Bus': 'MOTOR_PCV',
  'School Bus': 'MOTOR_PCV',
  'Misc (Tractor/ JCB/ Ambulance)': 'MOTOR_MISC',

  // Health / PA / Travel
  'Individual Health': 'HEALTH_INDIVIDUAL',
  'Senior Citizen Health': 'HEALTH_INDIVIDUAL',
  'Critical Illness': 'HEALTH_INDIVIDUAL',
  'Top-Up / Super Top-Up': 'HEALTH_INDIVIDUAL',
  'Family Floater': 'HEALTH_FAMILY_FLOATER',
  'Group Health': 'HEALTH_GROUP',
  'Personal Accident': 'PERSONAL_ACCIDENT',
  'Domestic Travel': 'TRAVEL',
  'International Travel': 'TRAVEL',

  // Life
  'Term Plan': 'LIFE_INDIVIDUAL',
  'ULIP': 'LIFE_INDIVIDUAL',
  'Endowment Plan': 'LIFE_INDIVIDUAL',
  'Whole Life Plan': 'LIFE_INDIVIDUAL',
  'Money Back Plan': 'LIFE_INDIVIDUAL',
  'Pension / Retirement Plan': 'LIFE_INDIVIDUAL',
  'Child Plan': 'LIFE_INDIVIDUAL',
  'Group Term Life': 'LIFE_GROUP',

  // Fire / Burglary / Shopkeeper
  'Standard Fire and Special Perils': 'FIRE',
  'Industrial All Risk': 'FIRE',
  'Burglary Insurance': 'BURGLARY',
  "Shopkeeper's Insurance": 'SHOPKEEPERS',

  // Marine
  'Marine Cargo - Export': 'MARINE_CARGO',
  'Marine Cargo - Import': 'MARINE_CARGO',
  'Marine Cargo - Inland Transit': 'MARINE_CARGO',
  'Marine Open Cover': 'MARINE_CARGO',
  'Marine Hull': 'MARINE_HULL',

  // CAR / CPM
  "Contractor's All Risk (CAR)": 'CONTRACTOR_ALL_RISK',
  'Erection All Risk (EAR)': 'CONTRACTOR_ALL_RISK',
  "Contractor's Plant and Machinery (CPM)": 'CONTRACTOR_PLANT',
  'Machinery Breakdown': 'CONTRACTOR_PLANT',

  // Workers Compensation
  'WC Act Policy': 'LIABILITY',
  "Employer's Liability": 'LIABILITY',
  'Group Personal Accident for Workers': 'PERSONAL_ACCIDENT',

  // Miscellaneous
  'Liability Insurance': 'LIABILITY',
  'Cyber Insurance': 'CYBER',
  'Fidelity Guarantee': 'FIDELITY_GUARANTEE',
  'Pet Insurance': 'PET',
  'Others': 'GENERIC',
};

// Looks up a sub-vertical by name and returns its field list, or null if
// there's no schema for it (unmapped sub-vertical — risk details won't be
// offered for it).
export function getRiskFields(subVerticalName) {
  const templateKey = SUB_VERTICAL_TEMPLATES[subVerticalName];
  if (!templateKey) return null;
  return RISK_TEMPLATES[templateKey] || null;
}
