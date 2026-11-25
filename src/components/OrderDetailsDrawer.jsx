import React, { useEffect, useRef } from 'react';
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
const INSTALLMENT_STATUS = {
  paid: { label: 'Paid', tone: 'lime' },
  pending: { label: 'Due', tone: 'sky' },
  overdue: { label: 'Overdue', tone: 'orange' },
  failed: { label: 'Failed', tone: 'orange' },
};

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
                <li key={i}>
                  <div>
                    <strong>{item.title || item.code}</strong>
                    <small>{[item.type, item.number > 1 ? `${item.number} × ${rupees(item.unitPrice)}` : '', item.paymentPlan === 'INSTALLMENT' ? 'Paid in installments' : ''].filter(Boolean).join(' · ')}</small>
                  </div>
                  {/* On an installment plan: what was paid for the item at checkout, not its whole fee. */}
                  <span>{rupees(paidFor(item))}</span>
                </li>
              ))}
            </ul>
            <dl className="cp-order-totals">
              <div><dt>Subtotal</dt><dd>{rupees(order.subTotal - deferred)}</dd></div>
              {order.discount > 0 && <div><dt>Discount</dt><dd>- {rupees(order.discount)}</dd></div>}
              {order.extras > 0 && <div><dt>Taxes and charges</dt><dd>{rupees(order.extras)}</dd></div>}
              <div className="is-total"><dt>{onInstallments ? 'Paid now' : 'Total'}</dt><dd>{rupees(order.amount)}</dd></div>
              {/* The whole fee of the order: this payment and the installments still to come. */}
              {onInstallments && <div><dt>Total Course Fee</dt><dd>{rupees(order.amount + deferred)}</dd></div>}
            </dl>
          </section>

          {/* Only a paid order has a schedule. */}
          {onInstallments && order.status === 'successful' && (
            <section className="cp-order-card">
              <h3>Payment schedule</h3>
              {scheduleGroups.length === 0 && <p className="cp-order-muted">The schedule for this order is not available yet.</p>}
              {scheduleGroups.map((group) => (
                <div className="cp-order-schedule" key={group.code}>
                  {scheduleGroups.length > 1 && <h4>{group.title || group.code}</h4>}
                  <ul className="cp-order-items">
                    {group.rows.map((row) => {
                      const ist = INSTALLMENT_STATUS[row.status] || INSTALLMENT_STATUS.pending;
                      return (
                        <li key={row.installmentNo}>
                          <div>
                            <strong>{row.label || `Installment ${row.installmentNo}`}</strong>
                            <small>{row.status === 'paid' ? `Paid on ${row.paidOn || row.dueOn}` : `Due on ${row.dueOn}`}</small>
                          </div>
                          <span className="cp-order-schedule-amount">
                            {rupees(row.amount)}
                            <Pill tone={ist.tone} size="sm">{ist.label}</Pill>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
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
