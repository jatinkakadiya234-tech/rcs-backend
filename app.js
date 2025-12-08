import expess from 'express';
import dotenv from 'dotenv';
import ConnectDB from './config/Db.js';
import userRouter from './User/UserRouter.js';
import cors from 'cors';
import TemplateRoute from './Tamplete/TampleteRoute.js';
import MessageApiRoute from './Message/MessageRoute.js';
dotenv.config();

const app = expess();
ConnectDB()
app.use(cors());

// JSON parsing for routes (excluding file upload)
app.use('/api/user', (req, res, next) => {
  if (req.path === '/uploadFile') {
    return next();
  }
  expess.json({ limit: '50mb' })(req, res, next);
});

app.use(expess.urlencoded({ extended: true, limit: '50mb' }));
app.use(expess.json({ limit: '50mb' }));

app.use('/api/user', userRouter);
app.use('/api/templates', TemplateRoute);
app.use('/api/message-reports', MessageApiRoute);
const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 