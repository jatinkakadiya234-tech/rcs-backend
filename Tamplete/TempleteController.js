import Template from "./TampletModel.js";
// 📌 Create Template
export const createTemplate = async (req, res) => {
  try {
    const template = new Template(req.body);
 let {name} = req.body;
  


    await template.save();
    res.status(201).json({
      success: true,
      message: "Template created successfully",
      data: template,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 📌 Get All Templates
export const getTemplates = async (req, res) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 📌 Get Template By ID
export const getTemplateById = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template)
      return res.status(404).json({ success: false, message: "Template not found" });

    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 📌 Update Template
export const updateTemplate = async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!template)
      return res.status(404).json({ success: false, message: "Template not found" });

    res.json({
      success: true,
      message: "Template updated successfully",
      data: template,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 📌 Delete Template
export const deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template)
      return res.status(404).json({ success: false, message: "Template not found" });

    res.json({ success: true, message: "Template deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 📌 Get Templates for Particular User
export const getUserTemplates = async (req, res) => {
  try {
    const { userId } = req.params;
    const templates = await Template.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
