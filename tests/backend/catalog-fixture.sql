-- Metadata-only controlled fixtures. Tests never contact peers or external media.
INSERT INTO movies (id,title,slug,overview,release_date,language,status,view_count) VALUES
('11111111-1111-4111-8111-111111111111','Orbit Test Movie','orbit-test-movie','Controlled space fixture','2020-01-01','en','active',10),
('11111111-1111-4111-8111-111111111112','Harbor Test Movie','harbor-test-movie','Controlled sea fixture','2021-01-01','en','active',1),
('11111111-1111-4111-8111-111111111113','Orbit Hidden Movie','orbit-hidden-movie','Unpublished fixture','2021-01-01','en','inactive',0);
INSERT INTO movie_genres (movie_id,genre_id) SELECT '11111111-1111-4111-8111-111111111111',id FROM genres WHERE slug='action';
INSERT INTO movie_genres (movie_id,genre_id) SELECT '11111111-1111-4111-8111-111111111112',id FROM genres WHERE slug='comedy';
INSERT INTO shows (id,title,slug,overview,language,status,season_count,episode_count) VALUES
('22222222-2222-4222-8222-222222222221','Orbit Test Series','orbit-test-series','Controlled series fixture','en','ongoing',1,1),
('22222222-2222-4222-8222-222222222222','Orbit Ended Series','orbit-ended-series','Controlled series fixture','en','ended',0,0),
('22222222-2222-4222-8222-222222222223','Orbit Cancelled Series','orbit-cancelled-series','Controlled series fixture','en','cancelled',0,0),
('22222222-2222-4222-8222-222222222224','Orbit Hidden Series','orbit-hidden-series','Unpublished series fixture','en','pending_review',1,1);
INSERT INTO show_genres (show_id,genre_id) SELECT '22222222-2222-4222-8222-222222222221',id FROM genres WHERE slug='action';
INSERT INTO seasons (id,show_id,season_number,title,episode_count) VALUES
('33333333-3333-4333-8333-333333333331','22222222-2222-4222-8222-222222222221',1,'Season one',1),
('33333333-3333-4333-8333-333333333332','22222222-2222-4222-8222-222222222224',1,'Hidden season',1);
INSERT INTO episodes (id,show_id,season_id,episode_number,title) VALUES
('44444444-4444-4444-8444-444444444441','22222222-2222-4222-8222-222222222221','33333333-3333-4333-8333-333333333331',1,'Orbit pilot'),
('44444444-4444-4444-8444-444444444442','22222222-2222-4222-8222-222222222224','33333333-3333-4333-8333-333333333332',1,'Hidden pilot');
INSERT INTO magnet_links (content_type,content_id,magnet_uri,info_hash,quality) VALUES
('movie','11111111-1111-4111-8111-111111111111','magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','1080p'),
('episode','44444444-4444-4444-8444-444444444441','magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','720p'),
('movie','11111111-1111-4111-8111-111111111113','magnet:?xt=urn:btih:cccccccccccccccccccccccccccccccccccccccc','cccccccccccccccccccccccccccccccccccccccc','720p'),
('episode','44444444-4444-4444-8444-444444444442','magnet:?xt=urn:btih:dddddddddddddddddddddddddddddddddddddddd','dddddddddddddddddddddddddddddddddddddddd','720p');
