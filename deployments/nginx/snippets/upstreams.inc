# StreamForge API Gateway
upstream auth_service {
    server auth-service:8001;
}

upstream content_service {
    server content-service:8002;
}

upstream user_service {
    server user-service:8003;
}

upstream search_service {
    server search-service:8004;
}
