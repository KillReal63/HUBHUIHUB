"""Calendar-based schedule generation shared conceptually with schedule.js."""
import datetime as dt

def move_moment(moment, minutes):
    return (dt.datetime.fromisoformat(moment)+dt.timedelta(minutes=minutes)).isoformat(timespec='minutes')

def shifted_moment(med, base):
    return move_moment(base,sum(s['minutes'] for s in med.get('shifts',[]) if base>=s['from']))

def scheduled_on(med,date):
    if date<med['start'] or (med['end'] and date>med['end']):return False
    day=dt.date.fromisoformat(date)
    if 'cycle' in med:
        cycle=med['cycle']
        return (day-dt.date.fromisoformat(med['start'])).days % (cycle['on']+cycle['off']) < cycle['on']
    return (day.weekday()+1)%7 in med['days']

def schedule_entries(state,date):
    result=[];fixed_by_med={}
    for key,moment in state.get('fixed',{}).items():
        if moment[:10]==date:fixed_by_med.setdefault(key.split('|')[1],[]).append(key)
    for med in state['meds']:
        offsets={0};offset=0
        for shift in sorted(med.get('shifts',[]),key=lambda s:s['from']):
            offset+=shift['minutes'];offsets.add(offset)
        dates={date}
        for offset in offsets:
            dates.add(move_moment(date+'T00:00',-offset)[:10])
            dates.add(move_moment(date+'T23:59',-offset)[:10])
        seen=set()
        def add(base_date,clock):
            key=f"{base_date}|{med['id']}|{clock}"
            if key in seen:return
            seen.add(key)
            base=base_date+'T'+clock
            settled=key in state['taken'] or key in state.get('skipped',{})
            moment=state.get('fixed',{}).get(key,base) if settled else shifted_moment(med,base)
            if moment[:10]==date:result.append((key,moment))
        for base_date in dates:
            if scheduled_on(med,base_date):
                for clock in med['times']:add(base_date,clock)
        for key in fixed_by_med.get(med['id'],[]):
            base_date,_,clock=key.split('|');add(base_date,clock)
    return sorted(result,key=lambda item:(item[1],item[0]))
