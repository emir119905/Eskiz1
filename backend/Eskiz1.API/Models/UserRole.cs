namespace Eskiz1.API.Models
{
    // erişim seviyesi: Developer/Admin, Geliştirici Araçları (Model Lab, Veri Yönetimi) ve
    // ilgili mutasyon endpoint'lerine erişebilir; User bunlara erişemez.
    public enum UserRole
    {
        User = 0,
        Developer = 1,
        Admin = 2
    }
}
