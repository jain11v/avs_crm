const db = require('../config/db');

async function getStates(req, res, next) {
  try {
    const result = await db.query('SELECT id, name, code FROM states ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getCities(req, res, next) {
  try {
    const { state_id } = req.query;

    if (!state_id) {
      return res.status(400).json({ error: 'state_id is required.' });
    }

    const result = await db.query(
      'SELECT id, name, pincode FROM cities WHERE state_id = $1 ORDER BY name',
      [state_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getEmployees(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, first_name, last_name FROM employees WHERE is_active = true ORDER BY first_name`
    );
    res.json(result.rows.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` })));
  } catch (err) {
    next(err);
  }
}

async function getBranches(req, res, next) {
  try {
    const result = await db.query('SELECT id, name FROM broker_branches ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getCustomerTypes(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name FROM customer_types WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getCustomerSources(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name FROM customer_sources WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getInsurers(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name FROM insurers WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/lookups/insurer-branches?insurer_id=
async function getInsurerBranches(req, res, next) {
  try {
    const { insurer_id } = req.query;

    if (!insurer_id) {
      return res.status(400).json({ error: 'insurer_id is required.' });
    }

    const result = await db.query(
      `SELECT id, name, branch_code FROM insurer_branches
       WHERE insurer_id = $1 AND is_active = true ORDER BY name`,
      [insurer_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getDepartments(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name FROM broker_departments WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/lookups/designations?department_id=
async function getDesignations(req, res, next) {
  try {
    const { department_id } = req.query;

    const conditions = ['is_active = true'];
    const params = [];
    if (department_id) {
      params.push(department_id);
      conditions.push(`department_id = $${params.length}`);
    }

    const result = await db.query(
      `SELECT id, title AS name FROM designations WHERE ${conditions.join(' AND ')} ORDER BY title`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getHeads(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name FROM heads WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getBankNames(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name FROM bank_names WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getVerticals(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, name FROM verticals WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/lookups/sub-verticals?vertical_id=
async function getSubVerticals(req, res, next) {
  try {
    const { vertical_id } = req.query;

    if (!vertical_id) {
      return res.status(400).json({ error: 'vertical_id is required.' });
    }

    const result = await db.query(
      `SELECT id, name FROM sub_verticals
       WHERE vertical_id = $1 AND is_active = true ORDER BY name`,
      [vertical_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getBankAccounts(req, res, next) {
  try {
    const result = await db.query(
      `SELECT ba.id, ba.name, bn.name AS bank_name
       FROM bank_accounts ba
       LEFT JOIN bank_names bn ON ba.bank_name_id = bn.id
       ORDER BY bn.name, ba.name`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStates, getCities, getEmployees, getBranches, getCustomerTypes, getCustomerSources,
  getInsurers, getInsurerBranches, getBankNames, getDepartments, getDesignations,
  getVerticals, getSubVerticals, getBankAccounts, getHeads,
};
