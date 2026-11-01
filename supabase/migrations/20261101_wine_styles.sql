-- Fewer wine types: the port tasting's own types become the general ones
update wines set style = 'Fortified' where style in ('Vintage', 'Tawny', 'White', 'Rivesaltes');
update wines set style = 'Other' where style = 'Aguardente';
