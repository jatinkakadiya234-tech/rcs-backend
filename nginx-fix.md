# Fix 413 Request Entity Too Large Error

## Solution: Update Nginx Configuration

### Step 1: SSH into your server
```bash
ssh your-server
```

### Step 2: Edit Nginx configuration
```bash
sudo nano /etc/nginx/nginx.conf
```

### Step 3: Add this inside `http` block:
```nginx
http {
    client_max_body_size 50M;
    client_body_buffer_size 10M;
    
    # ... other settings
}
```

### Step 4: Or add in your site config:
```bash
sudo nano /etc/nginx/sites-available/rcssender.com
```

Add inside `server` block:
```nginx
server {
    client_max_body_size 50M;
    client_body_buffer_size 10M;
    
    # ... other settings
}
```

### Step 5: Test and restart Nginx
```bash
sudo nginx -t
sudo systemctl restart nginx
```

## Alternative: Process in Batches on Frontend

If you can't access Nginx config, split the request on frontend:

```javascript
const BATCH_SIZE = 100;
const batches = [];

for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
  batches.push(phoneNumbers.slice(i, i + BATCH_SIZE));
}

for (const batch of batches) {
  await axios.post('/api/checkAvablityNumber', {
    phoneNumbers: batch,
    userId
  });
}
```
