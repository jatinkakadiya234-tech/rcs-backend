import jwt from 'jsonwebtoken';

const cookieAuth = (req, res, next) => {
  try {
    // Check for token in cookies first, then headers
    const token = req.cookies?.jio_token || req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      })
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    })
  }
}

export { cookieAuth as authenticateToken };
export default cookieAuth;