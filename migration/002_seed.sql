-- seed barbers + services (generated from sheet backup 2026-08-16)

insert into barbers (barber_id, name, name_ar, is_available, day_off, sort_order) values ('BR001', 'Omar', 'عمر', true, 1, 0) on conflict (barber_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available, day_off=excluded.day_off, sort_order=excluded.sort_order;
insert into barbers (barber_id, name, name_ar, is_available, day_off, sort_order) values ('BR002', 'Mohamed', 'محمد', true, 2, 1) on conflict (barber_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available, day_off=excluded.day_off, sort_order=excluded.sort_order;

insert into services (service_id, name, name_ar, is_available) values ('SV001', 'Haircut', 'قص الشعر', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
insert into services (service_id, name, name_ar, is_available) values ('SV002', 'Beard Trim', 'قص اللحية', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
insert into services (service_id, name, name_ar, is_available) values ('SV005', 'Hair Wash', 'خيط wax', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
insert into services (service_id, name, name_ar, is_available) values ('SV006', 'Hair Coloring', 'بخار', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
insert into services (service_id, name, name_ar, is_available) values ('SV007', 'Skin Cleaning', 'تنظيف البشرة', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
insert into services (service_id, name, name_ar, is_available) values ('SV008', 'Facial Mask', 'ماسك', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
insert into services (service_id, name, name_ar, is_available) values ('SV009', 'Black Mask', 'سشوار', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
insert into services (service_id, name, name_ar, is_available) values ('SV010', 'Hair Styling', 'ماسك للشعر', true) on conflict (service_id) do update set name=excluded.name, name_ar=excluded.name_ar, is_available=excluded.is_available;
