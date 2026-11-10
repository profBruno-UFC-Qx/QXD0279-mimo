# Criação de componentes base

Critério para ser "da base": aparece em **mais de uma tela** ou é uma primitiva de feedback/formulário. Componente de um fluxo específico só (ex.: dialog de destinação) não é da base — pertence a quem faz o fluxo, mas precisa ser montado só com primitivas da base.

Nada de CSS próprio para o que o Vuetify já resolve: a base embrulha as primitivas abaixo e o resto do time consome só os wrappers (o comportamento/props visuais ficam congelados num lugar só):

- [x] `VAppBar` — criar `AppHeader` e a topbar do `AdminShell`.
- [x] `VNavigationDrawer` — criar `AppDrawer` com itens conforme o papel do usuário.
- [x] `VMenu` + `VList` — criar `UserMenu` e `NotificationMenu`.
- [x] `VBadge` — exibir o contador de notificações não lidas no sino.
- [x] `VDialog` — criar `ConfirmDialog` e os modais dos fluxos de entrega e destinação.
- [x] `VSnackbar` — criar `AppSnackbar` como única saída de feedback do app.
- [x] `VChip` — criar `StatusChip` para status de item e de perda.
- [ ] `VTable` — usar nas tabelas admin de itens, perdas, prédios, categorias e admins.
- [x] `VPagination` — criar `PaginationFooter`.
- [x] `VSkeletonLoader` — criar `LoadingOverlay`.
- [x] `VAlert` — criar `ErrorAlert` e as caixas de aviso dos fluxos.
- [ ] `VTextField` / `VSelect` / `VTextarea` — configurar defaults do tema para todos os formulários (§ 3.2).
- [ ] `VDatePicker` (dentro de `VMenu`) — criar `DatePickerField`.
- [ ] `VFileInput` + `VImg` — criar `PhotoUploader` e `ItemPhotoGallery`.
- [x] `VEmptyState` + `VIcon` — criar `EmptyState`.
- [ ] `VCard` + `VBtn` + `VIcon` — criar `ItemCard`, `BuildingCard`, `StatCard`, `SuggestionCard` e demais cards.
