# Jio Store API Guide

## Overview
આ system માં jio store functionality add કરવામાં આવી છે જે user profile અને admin registration પર આધારિત છે.

## Features
1. **User Profile Jio ID Check**: User ના profile માં jio ID હોય તો જ store થશે
2. **Admin Registration Required**: Admin register કરે ત્યારે જ store થાવું જોઈએ
3. **Global Middleware**: બધી APIs માટે middleware લાગે છે

## API Endpoints

### 1. Jio Store Registration (Admin Only)
```
POST /api/v1/user/jio-store/register
```

**Request Body:**
```json
{
  "adminId": "admin_user_id",
  "userId": "target_user_id", 
  "jioId": "jio_store_id",
  "jioSecret": "jio_store_secret"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Jio store registered successfully",
  "user": {
    "name": "User Name",
    "email": "user@email.com",
    "jioId": "jio_store_id",
    "active": true
  },
  "registeredBy": "Admin Name"
}
```

### 2. Check Jio Store Status
```
GET /api/v1/user/jio-store/status/:userId
```

**Response:**
```json
{
  "success": true,
  "user": {
    "name": "User Name",
    "email": "user@email.com",
    "hasJioStore": true,
    "isActive": true,
    "canUseStore": true
  }
}
```

### 3. Send Message (With Jio Store Check)
```
POST /api/v1/user/sendMessage
```

**Request Body:**
```json
{
  "userId": "user_id",
  "type": "text",
  "content": "Hello World",
  "phoneNumbers": ["+919999999999"]
}
```

**Response (If No Jio Store):**
```json
{
  "success": false,
  "message": "Jio store not available",
  "reason": "No jio ID found"
}
```

## Middleware Functionality

### 1. jioStoreMiddleware
- બધી API calls માં automatically check કરે છે
- User ના profile માં jio ID અને active status check કરે છે
- req.jioStore object માં information store કરે છે

### 2. adminJioStoreMiddleware  
- Admin registration માટે specific middleware
- Admin role check કરે છે
- Only admin users can register jio store

## Database Schema Updates

User Model માં નવા fields add કર્યા છે:
```javascript
{
  jioId: {
    type: String,
    default: null
  },
  jioSecret: {
    type: String, 
    default: null
  },
  active: {
    type: Boolean,
    default: true
  }
}
```

## Usage Flow

1. **Admin Registration**: Admin user jio store register કરે છે
2. **User Profile Update**: User ના profile માં jio ID અને secret store થાય છે
3. **API Calls**: જ્યારે user API call કરે છે, middleware check કરે છે
4. **Store Access**: જો jio ID હોય અને user active હોય તો જ store access મળે છે

## Error Handling

- **No Admin**: "Admin registration required"
- **No Jio ID**: "No jio ID found" 
- **User Inactive**: "User not active"
- **No Store Access**: "Jio store not available"

## Security Features

- Admin role verification
- User authentication check
- Automatic middleware protection
- Error handling for all scenarios