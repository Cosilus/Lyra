import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

// Same base as before (framer-motion, spring-driven deploy, closing plays
// the exact same spring motion as opening. Just reversed) but the trigger
// now sits top-right as a compact circular icon button that nudges right
// when pressed, and items deploy horizontally to its LEFT instead of below.

const CONSTANTS = {
  itemSize: 40,
  itemGap: 16,
  rowOffsetX: 46,
  openStagger: 0.06,
  closeStagger: 0.06
};

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

// The row opens to the LEFT of the trigger. On a narrow window (a browser side panel) a full-size row
// ran over the Lyra mark at the top left, so the row is fitted to the room there: the buttons get a
// little smaller and closer until the last one stops just short of the mark. On a wide window
// nothing changes (size 38, step 56).
const FRAME_MAX_W = 420;      // .frame max-width
const CENTER_FROM_RIGHT = 41; // the closed row's centre is this far from the frame's right edge
const SAFE_LEFT = 112;        // the Lyra mark (with its rays) ends at about x = 106 in the header
const MIN_STEP = 30;

function useViewportWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

function fitRow(viewportWidth, count) {
  const center = Math.min(viewportWidth, FRAME_MAX_W) - CENTER_FROM_RIGHT;
  const full = CONSTANTS.itemSize + CONSTANTS.itemGap;
  for (let step = full; step >= MIN_STEP; step--) {
    const size = Math.min(CONSTANTS.itemSize - 2, step - 5);
    const lastLeft = center - size / 2 - (size + 8) - (count - 1) * step;
    if (lastLeft >= SAFE_LEFT || step === MIN_STEP) return { step, size, offset: size + 8 };
  }
}

function MenuItem({ icon, label, onClick, index, isOpen, row }) {
  const x = -(row.offset + index * row.step);
  const y = 0;

  return (
    <motion.button
      type="button"
      animate={{
        x: isOpen ? x : 0,
        y: isOpen ? y : 0,
        opacity: isOpen ? 1 : 0
      }}
      whileHover={{
        scale: 1.1,
        transition: { duration: 0.1, delay: 0 }
      }}
      transition={{
        delay: isOpen ? index * CONSTANTS.openStagger : index * CONSTANTS.closeStagger,
        type: "spring",
        stiffness: 170,
        damping: 24
      }}
      style={{ height: row.size, width: row.size }}
      className="circle-menu-item"
      onClick={onClick}
      aria-label={label}
      title={label}
      tabIndex={isOpen ? 0 : -1}
    >
      {icon}
    </motion.button>
  );
}

function MenuTrigger({ isOpen, onToggle }) {
  return (
    <button
      type="button"
      className={cx("circle-menu-trigger", isOpen && "active")}
      onClick={onToggle}
      aria-label="Open menu"
    >
      <AnimatePresence mode="popLayout">
        {isOpen ? (
          <motion.span
            key="menu-close"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2 }}
          >
            <X size={16} strokeWidth={2} />
          </motion.span>
        ) : (
          <motion.span
            key="menu-open"
            className="circle-menu-trigger-label"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2 }}
          >
            <span>Menu</span>
            <ArrowRight size={15} strokeWidth={2} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export function CircleMenu({ items, open, setOpen }) {
  const row = fitRow(useViewportWidth(), items.length);
  function handleItemClick(item) {
    return () => {
      item.onClick?.();
      if (open && !item.keepOpen) {
        setOpen(false);
      }
    };
  }

  return (
    <div style={{ height: CONSTANTS.itemSize }} className="circle-menu-root">
      <div className="circle-menu-items">
        {items.map((item, index) => (
          <MenuItem
            key={`menu-item-${index}`}
            icon={item.icon}
            label={item.label}
            onClick={handleItemClick(item)}
            index={index}
            isOpen={open}
            row={row}
          />
        ))}
      </div>
      <MenuTrigger isOpen={open} onToggle={() => setOpen(v => !v)} />
    </div>
  );
}
