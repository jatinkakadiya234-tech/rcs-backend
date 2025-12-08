// models/RcsTemplate.js
import mongoose from "mongoose";

// ---------- COMMON ACTIONS ----------
const ActionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["reply", "url", "call"],
    required: true,
  },
  title: { type: String, required: true },
  payload: { type: String } // reply payload, link, number
}, { _id: false });

// ---------- CAROUSEL ITEMS ----------
const CarouselItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String },
  imageUrl: { type: String },
  actions: [ActionSchema]
}, { _id: false });

// ---------- RCS RICH CARD ----------
const RichCardSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String },
  imageUrl: { type: String },
  actions: [ActionSchema]
}, { _id: false });

// ================ MAIN TEMPLATE ====================
const TemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  language: { type: String, default: "en" },

  messageType: {
    type: String,
    enum: ["plain-text", "text-with-action", "rcs", "carousel"],
    required: true
  },

  // MAIN CONTENT (depending on type)
  text: { type: String },                       // for plain & text+action
  actions: [ActionSchema],                      // for text-with-action, rcs
  imageUrl: { type: String },                   // optional for rcs

  richCard: RichCardSchema,                     // for rcs only
  carouselItems: [CarouselItemSchema],          // for carousel only

  createdAt: { type: Date, default: Date.now }
});

// ========== CUSTOM VALIDATION BASED ON TYPE ==========
TemplateSchema.pre("validate", function (next) {
  if (this.messageType === "plain-text") {
    if (!this.text) return next(new Error("Plain-text requires 'text'"));
  }

  if (this.messageType === "text-with-action") {
    if (!this.text) return next(new Error("text-with-action requires 'text'"));
    if (!this.actions?.length) return next(new Error("text-with-action requires actions"));
  }

  if (this.messageType === "rcs") {
    if (!this.richCard || !this.richCard.title)
      return next(new Error("rcs requires richCard with title"));
  }

  if (this.messageType === "carousel") {
    if (!this.carouselItems?.length)
      return next(new Error("carousel requires carouselItems"));
  }

  next();
});

export default mongoose.model("tbl_Templates", TemplateSchema);
