import { Outlet, NavLink } from 'react-router-dom';
import { IoCalendarOutline, IoCall, IoPeopleOutline } from 'react-icons/io5';
import styles from './AppShell.module.css';

export type AppShellOutletContext = { onLogout: () => void };

export default function AppShell({ onLogout }: { onLogout: () => void }) {
  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <Outlet context={{ onLogout } satisfies AppShellOutletContext} />
      </div>
      <nav className={styles.nav} aria-label="Primary">
        <NavLink to="/app/appointments" className={navCls}>
          <IoCalendarOutline size={22} aria-hidden />
          <span>Appointments</span>
        </NavLink>
        <NavLink to="/app/enquiries" className={navCls}>
          <IoPeopleOutline size={22} aria-hidden />
          <span>Enquiries</span>
        </NavLink>
        <NavLink to="/app/calls" className={navCls}>
          <IoCall size={22} aria-hidden />
          <span>Calls</span>
        </NavLink>
      </nav>
    </div>
  );
}

function navCls({ isActive }: { isActive: boolean }) {
  return `${styles.navItem} ${isActive ? styles.navItemActive : ''}`;
}
