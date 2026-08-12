import { Schema, model } from 'mongoose';

const ClientSchema = new Schema({
  name:  { type: String, required: true },
  phone: { type: String, required: true, index: true },
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('Client', ClientSchema);
