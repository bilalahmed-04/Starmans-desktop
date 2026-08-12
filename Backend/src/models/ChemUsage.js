import { Schema, model } from 'mongoose';

const ChemUsageSchema = new Schema({
  date: { type: String, required: true },
  qty:  { type: Number, required: true },
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('ChemUsage', ChemUsageSchema);
