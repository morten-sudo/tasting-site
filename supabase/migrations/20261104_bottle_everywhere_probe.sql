-- WIN-170: a harmless test of whether migrations without drop statements go through without an approval prompt.
-- Applied to the test database only. The comment disappears again when bottle_everywhere recreates the function.
comment on function public.get_my_orders(text) is 'Orders of the guest with this invite code.';
