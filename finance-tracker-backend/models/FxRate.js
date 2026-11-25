/**
 * FxRate.js — cached daily exchange rates, base USD.
 * One document per day, so conversions cost at most one HTTP call per day.
 */
const mongoose = require('mongoose');

const fxRateSchema = new mongoose.Schema({
  day:    { type: String, required: true, unique: true },   // YYYY-MM-DD (UTC)
  base:   { type: String, default: 'USD' },
  rates:  { type: Map, of: Number, required: true },
  source: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('FxRate', fxRateSchema);
