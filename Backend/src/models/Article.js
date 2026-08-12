import { Schema, model } from 'mongoose';

const ArticleSchema = new Schema({
  name:  { type: String, required: true },
  price: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  color: { type: String, default: '' },
  size:  { type: String, default: '' },
}, {
  toJSON: {
    virtuals: true,
    transform: (_, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default model('Article', ArticleSchema);
