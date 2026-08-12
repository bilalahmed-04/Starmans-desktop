import { Schema, model } from 'mongoose';

// Single document — always queried with findOne()
const SettingsSchema = new Schema({
  username:     { type: String, required: true, default: 'admin' },
  passwordHash: { type: String, required: true },
});

export default model('Settings', SettingsSchema);
