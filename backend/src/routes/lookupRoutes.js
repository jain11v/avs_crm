const express = require('express');
const router = express.Router();
const {
  getStates, getCities, getEmployees, getBranches, getCustomerTypes, getCustomerSources,
  getInsurers, getInsurerBranches, getBankNames, getDepartments, getDesignations,
  getVerticals, getSubVerticals, getBankAccounts, getHeads,
} = require('../controllers/lookupController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/states', getStates);
router.get('/cities', getCities);
router.get('/employees', getEmployees);
router.get('/branches', getBranches);
router.get('/customer-types', getCustomerTypes);
router.get('/customer-sources', getCustomerSources);
router.get('/insurers', getInsurers);
router.get('/insurer-branches', getInsurerBranches);
router.get('/bank-names', getBankNames);
router.get('/departments', getDepartments);
router.get('/designations', getDesignations);
router.get('/verticals', getVerticals);
router.get('/sub-verticals', getSubVerticals);
router.get('/bank-accounts', getBankAccounts);
router.get('/heads', getHeads);

module.exports = router;
