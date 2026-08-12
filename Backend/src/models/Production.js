import { Schema, model } from 'mongoose';

const ProductionEntrySchema = new Schema({
  articleId:   { type: String, required: true },
  articleName: { type: String, required: true },
  qty:         { type: Number, required: true },
}, { _id: false });

const ProductionSchema = new Schema({
  date:    { type: String, required: true },
  entries: [ProductionEntrySchema],
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('Production', ProductionSchema);
