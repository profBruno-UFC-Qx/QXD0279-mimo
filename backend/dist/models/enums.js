export var UserRole;
(function (UserRole) {
    UserRole["USER"] = "USER";
    UserRole["ADMIN"] = "ADMIN";
    UserRole["SUPERADMIN"] = "SUPERADMIN";
})(UserRole || (UserRole = {}));
export var ItemStatus;
(function (ItemStatus) {
    ItemStatus["AVAILABLE"] = "AVAILABLE";
    ItemStatus["ELIGIBLE"] = "ELIGIBLE";
    ItemStatus["HANDED_OVER"] = "HANDED_OVER";
    ItemStatus["SOLD"] = "SOLD";
    ItemStatus["AUCTIONED"] = "AUCTIONED";
    ItemStatus["DONATED"] = "DONATED";
    ItemStatus["DISCARDED"] = "DISCARDED";
})(ItemStatus || (ItemStatus = {}));
export var LostReportStatus;
(function (LostReportStatus) {
    LostReportStatus["OPEN"] = "OPEN";
    LostReportStatus["RESOLVED"] = "RESOLVED";
    LostReportStatus["CANCELLED"] = "CANCELLED";
})(LostReportStatus || (LostReportStatus = {}));
export var DispositionType;
(function (DispositionType) {
    DispositionType["SOLD"] = "SOLD";
    DispositionType["AUCTIONED"] = "AUCTIONED";
    DispositionType["DONATED"] = "DONATED";
    DispositionType["DISCARDED"] = "DISCARDED";
})(DispositionType || (DispositionType = {}));
export var NotificationType;
(function (NotificationType) {
    NotificationType["MATCH_FOUND"] = "MATCH_FOUND";
    NotificationType["ITEM_CLAIMED"] = "ITEM_CLAIMED";
})(NotificationType || (NotificationType = {}));
