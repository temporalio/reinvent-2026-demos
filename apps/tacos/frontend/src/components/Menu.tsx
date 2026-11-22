import { useEffect, useState } from 'react'
import type { CartItem, MenuItem } from '../types'

interface MenuProps {
  cart: CartItem[]
  onAddToCart: (item: MenuItem) => void
  onViewCart: () => void
}

export function Menu({ cart, onAddToCart, onViewCart }: MenuProps) {
  const [error, setError] = useState(false)
  const [items, setItems] = useState<MenuItem[]>([])

  useEffect(() => {
    fetch('/dejavutacos/api/menu')
      .then((r) => { if (!r.ok) throw new Error('Menu unavailable'); return r.json() })
      .then((menu: MenuItem[]) => setItems(menu.map((item) => ({ ...item, name: SPACE_NAMES[item.id] ?? item.name }))))
      .catch(() => setError(true))
  }, [])

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const categories = [...new Set(items.map((i) => i.category))]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-white">
        <h1 className="text-lg font-bold">Galactic provisions</h1>
        <p className="text-xs opacity-80">Fresh tacos. Durable delivery.</p>
      </div>

      {/* Menu items */}
      <div className="taqueria-menu-items flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {error && <p role="alert">The menu is unavailable. Check the API connection and reload.</p>}
        {categories.map((cat) => (
          <div key={cat} className="taqueria-menu-category">
            <h2 className="text-sm font-bold text-orange-800 uppercase tracking-wider mb-2">
              {cat}
            </h2>
            <div className="space-y-2">
              {items
                .filter((i) => i.category === cat)
                .map((item) => (
                  <div
                    key={item.id}
                    className="taqueria-menu-item bg-white rounded-xl p-3 shadow-sm flex items-center gap-3"
                  >
                    <span className="text-3xl">{item.image}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {item.name}
                      </h3>
                      <p className="taqueria-menu-description text-xs text-gray-500">
                        {item.description}
                      </p>
                      <p className="text-sm font-bold text-orange-600">
                        ${item.price.toFixed(2)}
                      </p>
                    </div>
                    <button
                      aria-label={`Add ${item.name}`}
                      onClick={() => onAddToCart(item)}
                      className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg hover:bg-orange-600 active:scale-95 transition-all"
                    >
                      +
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cart bar */}
      {cartCount > 0 && (
        <div className="p-3 bg-white border-t border-orange-100">
          <button
            onClick={onViewCart}
            className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-600 active:scale-[0.98] transition-all"
          >
            <span className="bg-white text-orange-500 w-6 h-6 rounded-full text-sm flex items-center justify-center">
              {cartCount}
            </span>
            View Cart
          </button>
        </div>
      )}
    </div>
  )
}

const SPACE_NAMES: Record<string, string> = {
  'crunch-wrap': 'Lunar Crunch Wrap', 'taco-supreme': 'Nebula Taco',
  'saga-nachos': 'Asteroid Nachos', burrito: 'Orbit Burrito', quesadilla: 'Solar Quesadilla',
  'cinnamon-twists': 'Cosmic Twists', churro: 'Comet Churro', 'baja-blast': 'Supernova Soda',
}
