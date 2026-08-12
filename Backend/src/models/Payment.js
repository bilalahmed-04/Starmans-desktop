import { Schema, model } from 'mongoose';

const PaymentSchema = new Schema({
  date:           { type: String, required: true },
  time:           { type: String, required: true },
  clientId:       { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  clientName:     { type: String, required: true },
  clientPhone:    { type: String, required: true },
  method:         { type: String, enum: ['Cash', 'Cheque', 'Online', 'Slip'], required: true },
  amount:         { type: Number, required: true },
  desc:           { type: String, default: '' },
  collectionDate: { type: String },
  chequeDate:     { type: String },
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('Payment', PaymentSchema);
