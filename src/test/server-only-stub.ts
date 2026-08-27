// `server-only` je navrhnutý tak, aby pri importe mimo server komponentu
// spadol. V testoch beží kód v Node zámerne, takže ho nahrádzame prázdnym
// modulom — ochrana pred únikom do klientskeho bundlu ostáva v build kroku.
export {};
