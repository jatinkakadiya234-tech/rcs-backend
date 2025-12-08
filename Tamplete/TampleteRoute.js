import express from "express";  
import { createTemplate, deleteTemplate, getTemplateById, getTemplates, updateTemplate } from "./TempleteController.js";


const TemplateRoute = express.Router();

TemplateRoute.post("/", createTemplate);
TemplateRoute.get("/", getTemplates);
TemplateRoute.get("/:id", getTemplateById);
TemplateRoute.put("/:id", updateTemplate);
TemplateRoute.delete("/:id", deleteTemplate);
export default TemplateRoute;