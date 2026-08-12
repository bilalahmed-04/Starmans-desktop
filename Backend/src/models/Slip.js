import { Schema, model } from 'mongoose';

const SlipItemSchema = new Schema({
  name:           { type: String, required: true },
  qty:            { type: Number, required: true },
  price:          { type: Number, required: true },
  subtotal:       { type: Number, required: true },
  discountType:   { type: String, enum: ['%', 'Rs', null], default: null },
  discountAmount: { type: Number, default: 0 },
  discountPct:    { type: Number, default: 0 },
  amount:         { type: Number, required: true },
  desc:           { type: String, default: '' },
  size:           { type: String, default: '' },
  color:          { type: String, default: '' },
}, { _id: false });

const SlipSchema = new Schema({
  no:       { type: String, required: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  date:     { type: String, required: true },
  time:     { type: String, required: true },
  items:    [SlipItemSchema],
  total:    { type: Number, required: true },
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('Slip', SlipSchema);
