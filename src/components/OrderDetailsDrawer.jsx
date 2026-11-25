import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icons';
import { Pill } from './ui';

// transactions.php statuses, as shown on My Transactions and in this drawer.
export const TXN_STATUS = {
  successful: { label: 'Successful', tone: 'lime', hint: 'Payment received' },
  pending: { label: 'Pending', tone: 'sky', hint: 'Payment not completed yet' },
  failed: { label: 'Failed', tone: 'orange', hint: 'Payment was not completed' },
};

const DELIVERY_STATUS = {
  received: { label: 'Order received', tone: 'ghost' },
  processing: { label: 'Being packed', tone: 'sky' },
  despatched: { label: 'Despatched', tone: 'sky' },
  completed: { label: 'Delivered', tone: 'lime' },
  cancelled: { label: 'Delivery cancelled', tone: 'orange' },
};

// One installment of an order bought on a payment plan (candidate_payments), as transactions.php reports it.
// The status is candidate_payments.paymentStatus, shown as it is stored.
const INSTALLMENT_STATUS = {
  paid: { label: 'Paid', tone: 'lime' },
  scheduled: { label: 'Scheduled', tone: 'ghost' },
  upcoming: { label: 'Upcoming', tone: 'ghost' }, // pending, due date not passed (transactions.php displayStatus)
  pending: { label: 'Pending', tone: 'sky' },
  overdue: { label: 'Overdue', tone: 'orange' },
  failed: { label: 'Failed', tone: 'orange' },
};

// "size" -> "Size", as the cart labels an item's option.
const optionLabel = (name) => name.charAt(0).toUpperCase() + name.slice(1);

/** The info icon beside a tax or charge. Hovering, focusing or clicking it shows how much each item added. */
function ChargeSplit({ row }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={`cp-charge-info ${open ? 'is-open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`${row.label}: split by item`}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
      >
        i
      </button>
      <span className="cp-charge-split" role="tooltip" id={id}>
        <strong>{row.label} by item</strong>
        {row.items.map((item) => (
          <span className="cp-charge-split-row" key={item.itemCode}>
            <span>{item.title || item.itemCode}{typeof item.percent === 'number' && <em> ({item.percent}%)</em>}</span>
            <span>{rupees(item.value)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

export function rupees(paise) {
  const value = Number(paise) / 100;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value % 1 === 0 ? 0 : 2 })}`;
}

/**
 * Details of one order from My Transactions, in a drawer from the right:
 * every item, the amount break-up, the payment references, the installment
 * schedule of an item bought on a payment plan and, for an order
 * with books or merchandise, the delivery address and where the parcel is.
 * `order` is a row of transactions.php; null keeps the drawer closed.
 * Closes on Escape or a tap outside.
 */
export default function OrderDetailsDrawer({ order, onClose }) {
  const closeRef = useRef(null);
  const open = Boolean(order);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!order) return null;

  const st = TXN_STATUS[order.status] || TXN_STATUS.failed;
  const items = order.items || [];
  const addr = order.deliveryAddress;
  const delivery = order.delivery;
  const dst = delivery ? (DELIVERY_STATUS[delivery.status] || DELIVERY_STATUS.received) : null;
  // The installments of a paid order, one group per item bought on a plan.
  const onInstallments = order.paymentMode === 'INSTALLMENTS';
  const schedule = Array.isArray(order.schedule) ? order.schedule : [];
  const scheduleGroups = [];
  schedule.forEach((row) => {
    let group = scheduleGroups.find((g) => g.code === row.itemCode);
    if (!group) { group = { code: row.itemCode, title: row.itemTitle, rows: [] }; scheduleGroups.push(group); }
    group.rows.push(row);
  });
  // What an item paid at checkout, and how much of the order was left for later installments.
  const fullPrice = (item) => item.unitPrice * (item.number || 1);
  const paidFor = (item) => (item.paymentPlan === 'INSTALLMENT' && Number.isFinite(item.payNow) ? item.payNow : fullPrice(item));
  // Books and merchandise can be bought in several copies; courses and test series are one each.
  const isCounted = (item) => item.type === 'Book' || item.type === 'Merchandise' || item.number > 1;
  const chargeRows = [...(order.charges?.taxes || []), ...(order.charges?.extras || [])];
  const deferred = items.reduce((sum, item) => sum + Math.max(0, fullPrice(item) - paidFor(item)), 0);
  const cityLine = addr ? [addr.locality, addr.city].filter(Boolean).join(', ') : '';
  const stateLine = addr ? [addr.state, addr.pincode].filter(Boolean).join(' - ') : '';

  return (
    <div className="cp-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <aside className="cp-drawer" role="dialog" aria-modal="true" aria-labelledby="cp-order-title">
        <header className="cp-drawer-head">
          <div>
            <h2 id="cp-order-title">Order #{order.orderReference}</h2>
            <p>{[order.date, order.time].filter(Boolean).join(' · ') || 'Order details'}</p>
          </div>
          <button ref={closeRef} type="button" className="cp-icon-btn" aria-label="Close" onClick={onClose}><Icon.X width={18} height={18} /></button>
        </header>

        <div className="cp-drawer-body cp-order">
          <section className="cp-order-card cp-order-summary">
            <div>
              <small>Amount</small>
              <strong>{rupees(order.amount)}</strong>
            </div>
            <Pill tone={st.tone} title={st.hint}>{st.label}</Pill>
          </section>

          <section className="cp-order-card">
            <h3>{items.length === 1 ? 'Item' : `Items (${items.length})`}</h3>
            {items.length === 0 && <p className="cp-order-muted">No item details are stored for this order.</p>}
            <ul className="cp-order-items">
              {items.map((item, i) => (
                // The same details, in the same words, as the checkout cart showed for the item.
                <li key={i}>
                  <div>
                    <strong>{item.title || item.code}</strong>
                    {item.type && <small>{item.type}</small>}
                    {Object.entries(item.options || {}).map(([name, value]) => (
                      <small key={name}>{optionLabel(name)}: {value}</small>
                    ))}
                    {isCounted(item) && <small>Quantity: {item.number || 1}</small>}
                    {item.paymentPlan === 'INSTALLMENT' && <small>Payment Plan: Installments</small>}
                  </div>
                  {/* On an installment plan: what was paid for the item at checkout. */}
                  <span className="cp-order-price">
                    {rupees(paidFor(item))}
                    {isCounted(item) && <small>{rupees(item.unitPrice)} each</small>}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="cp-order-totals">
              <div><dt>Subtotal</dt><dd>{rupees(order.subTotal - deferred)}</dd></div>
              {order.discount > 0 && <div><dt>Discounts</dt><dd>- {rupees(order.discount)}</dd></div>}
              {/* One row per tax or charge, named as in the cart, with its split by item behind the info icon. */}
              {chargeRows.map((row) => (
                <div key={row.label}>
                  <dt className="cp-order-charge">{row.label}{row.items?.length > 0 && <ChargeSplit row={row} />}</dt>
                  <dd>{rupees(row.value)}</dd>
                </div>
              ))}
              {chargeRows.length === 0 && order.extras > 0 && <div><dt>Taxes and charges</dt><dd>{rupees(order.extras)}</dd></div>}
              <div className="is-total"><dt>{onInstallments && order.status === 'successful' ? 'Total Paid' : 'Total'}</dt><dd>{rupees(order.amount)}</dd></div>
            </dl>
          </section>

          {/* Only a paid order has a schedule. */}
          {onInstallments && order.status === 'successful' && (
            <section className="cp-order-card">
              <h3>Payment schedule</h3>
              {scheduleGroups.length === 0 && <p className="cp-order-muted">The schedule for this order is not available yet.</p>}
              {scheduleGroups.map((group) => (
                // One timeline per course: its installments top down along a vertical line, each led by its date.
                <div className="cp-order-schedule" key={group.code}>
                  <h4>{group.title || group.code}</h4>
                  <ol className="cp-timeline">
                    {group.rows.map((row) => {
                      // The API says what to show: displayStatus and its label.
                      const ist = INSTALLMENT_STATUS[row.displayStatus || row.status] || INSTALLMENT_STATUS.pending;
                      const paid = row.status === 'paid';
                      return (
                        <li key={row.installmentNo} className={`is-${ist.tone}`}>
                          <span className="cp-timeline-dot" aria-hidden="true">{paid && <Icon.Check width={11} height={11} />}</span>
                          <div className="cp-timeline-body">
                            <small className="cp-timeline-date">{paid ? 'Paid on' : 'Due on'} {(paid && row.paidOn) || row.dueOn || '-'}</small>
                            <strong>{row.label || `Installment ${row.installmentNo}`}</strong>
                          </div>
                          <span className="cp-timeline-amount">
                            {rupees(row.amount)}
                            <Pill tone={ist.tone} size="sm">{row.statusLabel || ist.label}</Pill>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </section>
          )}

          {order.hasProducts && (
            <section className="cp-order-card">
              <h3>Delivery address</h3>
              {addr ? (
                <address className="cp-order-address">
                  {addr.name && <strong>{addr.name}</strong>}
                  {addr.address && <span>{addr.address}</span>}
                  {cityLine && <span>{cityLine}</span>}
                  {stateLine && <span>{stateLine}</span>}
                  {addr.mobile && <span>Phone: {addr.mobile}</span>}
                </address>
              ) : <p className="cp-order-muted">No address is stored for this order.</p>}
              {dst && (
                <div className="cp-order-delivery">
                  <Pill tone={dst.tone} size="sm">{dst.label}</Pill>
                  {delivery.updatedOn && <small>Updated {delivery.updatedOn}</small>}
                  {(delivery.courier || delivery.trackingNumber) && (
                    <small>{[delivery.courier, delivery.trackingNumber && `Tracking no. ${delivery.trackingNumber}`].filter(Boolean).join(' · ')}</small>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="cp-order-card">
            <h3>Payment</h3>
            <dl className="cp-order-totals">
              <div><dt>Status</dt><dd>{st.hint}</dd></div>
              {order.paymentReference && <div><dt>Payment ID</dt><dd className="cp-order-ref">{order.paymentReference}</dd></div>}
              {order.gatewayOrder && <div><dt>Gateway order</dt><dd className="cp-order-ref">{order.gatewayOrder}</dd></div>}
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}
