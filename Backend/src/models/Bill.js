import { Schema, model } from 'mongoose';

const BillEntrySchema = new Schema({
  name:   { type: String, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const BillSchema = new Schema({
  date:    { type: String, required: true },
  month:   { type: String, required: true },
  entries: [BillEntrySchema],
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('Bill', BillSchema);
