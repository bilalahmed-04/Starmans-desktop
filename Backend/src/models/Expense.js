import { Schema, model } from 'mongoose';

const ExpenseRowSchema = new Schema({
  desc:  { type: String, required: true },
  price: { type: Number, required: true },
}, { _id: false });

const ExpenseSchema = new Schema({
  date: { type: String, required: true },
  time: { type: String, required: true },
  rows: [ExpenseRowSchema],
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('Expense', ExpenseSchema);
