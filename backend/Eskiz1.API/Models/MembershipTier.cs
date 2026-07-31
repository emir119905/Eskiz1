namespace Eskiz1.API.Models
{
    // şu an hiçbir yeri kısıtlamıyor/farklılaştırmıyor; ileride ücretli üyelik eklenirse
    // geçişi kolaylaştırmak için şema şimdiden tanımlanır.
    public enum MembershipTier
    {
        Free = 0,
        Pro = 1,
        Premium = 2,
        Vip = 3
    }
}
