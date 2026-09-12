import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

// Same base as before (framer-motion, spring-driven deploy, closing plays
// the exact same spring motion as opening — just reversed) but the trigger
// now sits top-right as a compact circular icon button that nudges right
// when pressed, and items deploy horizontally to its LEFT instead of below.

const CONSTANTS = {
  itemSize: 40,
  itemGap: 10,
  rowOffsetX: 46,
  openStagger: 0.06,
  closeStagger: 0.06
};

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const pointOnLeftRow = (i) => {
  const x = -(CONSTANTS.rowOffsetX + i * (CONSTANTS.itemSize + CONSTANTS.itemGap));
  return { x, y: 0 };
};

function MenuItem({ icon, label, onClick, index, isOpen }) {
  const { x, y } = pointOnLeftRow(index);
  const [hovering, setHovering] = useState(false);

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
      style={{ height: CONSTANTS.itemSize - 2, width: CONSTANTS.itemSize - 2 }}
      className="circle-menu-item"
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {icon}
      {hovering && <p className="circle-menu-item-label">{label}</p>}
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
          />
        ))}
      </div>
      <MenuTrigger isOpen={open} onToggle={() => setOpen(v => !v)} />
    </div>
  );
}
