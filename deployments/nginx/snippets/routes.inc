    # Health check
    location /health {
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }

    # ─── Auth Service ─────────────────────────────────────
    location /auth/ {
        limit_req zone=auth burst=5 nodelay;

        proxy_pass http://auth_service/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }

    # ─── Content Service ──────────────────────────────────
    location /api/v1/movies {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://content_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    location /api/v1/shows {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://content_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    location /api/v1/episodes {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://content_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    location /api/v1/genres {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://content_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    location /api/v1/content {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://content_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    # ─── User Service ─────────────────────────────────────
    location /api/v1/profile {
        limit_req zone=general burst=10 nodelay;
        proxy_pass http://user_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    location /api/v1/sync {
        limit_req zone=general burst=10 nodelay;
        proxy_pass http://user_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    # ─── Search Service ───────────────────────────────────
    location /api/v1/search {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://search_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }

    # ─── Admin endpoints (stricter rate limit) ────────────
    location /api/v1/admin {
        limit_req zone=auth burst=10 nodelay;
        proxy_pass http://content_service;
        include /etc/nginx/conf.d/proxy_params.conf;
    }
