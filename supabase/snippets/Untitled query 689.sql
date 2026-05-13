SELECT n.nspname as schema,
       p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname ILIKE 'house_bills_search_vect';