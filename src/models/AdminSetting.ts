import mongoose, { Document, Schema } from "mongoose";

export interface IAdminSetting extends Document {
  key: string;
  value: string;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const adminSettingSchema = new Schema<IAdminSetting>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, default: "", trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const AdminSetting = mongoose.model<IAdminSetting>("AdminSetting", adminSettingSchema);
